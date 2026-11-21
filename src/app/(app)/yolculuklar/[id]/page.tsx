import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { SummaryActions, SummaryMap } from "@/components/recording/summary-parts";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getTripDetail } from "@/lib/queries/recordings";
import { getTripJournal } from "@/lib/queries/journal";
import { getTravelogueIdForTrip } from "@/lib/queries/travelogue";
import { CreateFromTrip } from "@/components/travelogue/workspace/create-from-trip";
import { TripTools } from "@/components/tools/trip-tools";
import { TripJournal } from "@/components/journal/trip-journal";
import { TripInfo } from "@/components/journal/trip-info";
import { TripCostSection } from "@/components/cost/trip-cost-section";
import { formatDate, formatDistance, formatDuration, formatSpeed, formatTime } from "@/lib/format";
import { ShareButton } from "@/components/share/share-button";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { SummaryEndpoint as Endpoint, SummaryStat as Stat } from "@/components/trips/summary-stats";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.tripSummary.title };

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div data-themed className="h-dvh animate-pulse bg-sunken" aria-label={t.common.loading} />}>
      <TripDetailView params={params} />
    </Suspense>
  );
}

async function TripDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Oturum doğrulama ve ana sorgu paralel: bir veritabanı gidiş-dönüşü kazanılır (yetki RLS ile korunur)
  const [user, trip] = await Promise.all([requireUser(), getTripDetail(id)]);
  if (!trip) notFound();
  if (trip.status === "planned") redirect(`/planla/${trip.id}`);
  const [journal, travelogueId] = await Promise.all([getTripJournal(trip.id), getTravelogueIdForTrip(trip.id)]);
  const pins = [
    ...journal.media.filter((m) => m.lat !== null && m.lng !== null)
      .map((m) => ({ id: `m${m.id}`, lat: m.lat!, lng: m.lng!, kind: "photo" as const, label: m.caption ?? t.journal.tabs.gallery })),
    ...journal.notes.filter((n) => n.lat !== null && n.lng !== null)
      .map((n) => ({ id: `n${n.id}`, lat: n.lat!, lng: n.lng!, kind: "note" as const, label: n.locationName ?? n.title ?? t.journal.kinds[n.kind] })),
  ];

  const rec = trip.recording;
  const active = trip.status === "active" || rec?.status === "recording" || rec?.status === "paused";

  return (
    <div data-themed className="flex min-h-app-mobile flex-col text-fg lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[26rem_1fr]">
      <div className="relative order-1 h-[42vh] shrink-0 lg:order-2 lg:h-full">
        <SummaryMap styleUrl={mapStyleUrl()} polyline={rec?.polyline ?? null} plannedPolyline={trip.routePolyline} pins={pins} />
      </div>
      <aside className="page-backdrop order-2 min-w-0 space-y-7 border-t border-line bg-surface px-4 py-5 lg:order-1 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-6 lg:py-7">
        <header className="space-y-3">
          <Link href="/yolculuklar" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
            <ArrowLeft className="size-4" aria-hidden /> {t.trips.backToList}
          </Link>
          <SectionEyebrow className="pt-2">{t.tripSummary.title}</SectionEyebrow>
          <TripInfo id={trip.id} title={trip.title} description={trip.description} />
          {rec && (
            <p className="text-sm text-fg-subtle tabular-nums" data-testid="summary-date">
              {formatDate(rec.startedAt)} · {formatTime(rec.startedAt)}{rec.endedAt ? ` – ${formatTime(rec.endedAt)}` : ""}
            </p>
          )}
          <div className="pt-2">
            <ShareButton kind="trip" targetId={trip.id} disabledReason={active ? `${t.share.activeDisabled}. ${t.share.activeDisabledBody}` : undefined} />
          </div>
        </header>

        {active ? (
          <div className="space-y-3">
            <Alert>{t.tripSummary.stillRecording}</Alert>
            <ButtonLink href="/kayit-modu" variant="accent">{t.tripSummary.goRecording}</ButtonLink>
          </div>
        ) : rec ? (
          <>
            {rec.polyline === null && <Alert>{t.tripSummary.preparing}</Alert>}
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-line bg-line" data-testid="summary-stats">
              <Stat label={t.tripSummary.totalDistance} value={formatDistance(rec.distanceM)} testId="sum-distance" big />
              <Stat label={t.tripSummary.totalDuration} value={formatDuration(rec.elapsedS)} testId="sum-elapsed" big />
              <Stat label={t.tripSummary.moving} value={formatDuration(rec.movingS)} testId="sum-moving" />
              <Stat label={t.tripSummary.stopped} value={formatDuration(Math.max(0, rec.elapsedS - rec.movingS))} testId="sum-stopped" />
              <Stat label={t.tripSummary.avgSpeed} value={formatSpeed(rec.averageKmh)} testId="sum-avg" />
              <Stat label={t.tripSummary.maxSpeed} value={formatSpeed(rec.maxKmh)} testId="sum-max" />
            </dl>
            {rec.pausedS > 0 && (
              <p className="text-sm text-fg-muted">{t.tripSummary.paused}: {formatDuration(rec.pausedS)}</p>
            )}
            <p className="-mt-3 text-xs text-fg-subtle">{t.tripSummary.avgNote}</p>

            <dl className="card space-y-4 p-4 text-sm">
              <Endpoint label={t.tripSummary.start} value={rec.startLabel} time={rec.startedAt} />
              <Endpoint label={t.tripSummary.end} value={rec.endLabel} time={rec.endedAt} end />
            </dl>

            <p className="text-xs text-fg-subtle" data-testid="summary-points">
              {rec.pointCount === 0 ? t.tripSummary.noTrack : t.tripSummary.points(rec.pointCount)}
              {rec.rawPointCount === 0 && rec.pointCount > 0 && ` · ${t.tripSummary.rawDeleted}`}
            </p>
          </>
        ) : null}

        {!active && (
          <TripJournal userId={user.id} tripId={trip.id} notes={journal.notes} media={journal.media} startedAt={rec?.startedAt ?? null} />
        )}
        {!active && <Suspense fallback={null}><TripCostSection tripId={trip.id} recordedM={rec?.status === "completed" ? rec.distanceM : null} /></Suspense>}
        {!active && <TripTools tripId={trip.id} title={trip.title} />}
        {!active && <TravelogueCard tripId={trip.id} travelogueId={travelogueId} />}

        {!active && <SummaryActions tripId={trip.id} recordingId={rec?.recordingId ?? null} hasRawPoints={(rec?.rawPointCount ?? 0) > 0} />}
      </aside>
    </div>
  );
}

function TravelogueCard({ tripId, travelogueId }: { tripId: string; travelogueId: string | null }) {
  const T = t.travelogue.pages.tripCard;
  return (
    <section className="card space-y-3 p-5" aria-labelledby="trip-travelogue" data-testid="trip-travelogue">
      <h2 id="trip-travelogue" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-fg">
        <BookOpenText className="size-5 shrink-0 text-accent-ink" aria-hidden /> {T.title}
      </h2>
      <p className="text-sm leading-relaxed text-fg-muted">{T.body}</p>
      {travelogueId ? (
        <ButtonLink href={`/seyahatnameler/${travelogueId}`} size="sm" variant="primary">{T.open}</ButtonLink>
      ) : (
        <CreateFromTrip tripId={tripId} />
      )}
    </section>
  );
}
