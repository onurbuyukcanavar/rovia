import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { SummaryActions, SummaryMap } from "@/components/recording/summary-parts";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getTripDetail } from "@/lib/queries/recordings";
import { formatDate, formatDistance, formatDuration, formatSpeed, formatTime } from "@/lib/format";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.tripSummary.title };

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse bg-sand-100" aria-label={t.common.loading} />}>
      <TripDetailView params={params} />
    </Suspense>
  );
}

async function TripDetailView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const trip = await getTripDetail(id);
  if (!trip) notFound();
  if (trip.status === "planned") redirect(`/planla/${trip.id}`);

  const rec = trip.recording;
  const active = trip.status === "active" || rec?.status === "recording" || rec?.status === "paused";

  return (
    <div className="flex min-h-app-mobile flex-col lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[26rem_1fr]">
      <div className="relative order-1 h-[42vh] shrink-0 lg:order-2 lg:h-full">
        <SummaryMap styleUrl={mapStyleUrl()} polyline={rec?.polyline ?? null} plannedPolyline={trip.routePolyline} />
      </div>
      <aside className="order-2 space-y-6 border-t border-sand-200 bg-paper px-4 py-5 lg:order-1 lg:overflow-y-auto lg:border-t-0 lg:border-r lg:px-6 lg:py-6">
        <header className="space-y-1">
          <Link href="/yolculuklar" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-ink-900">
            <ArrowLeft className="size-4" aria-hidden /> {t.trips.backToList}
          </Link>
          <p className="eyebrow">{t.tripSummary.title}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{trip.title}</h1>
          {rec && (
            <p className="text-sm text-stone-600" data-testid="summary-date">
              {formatDate(rec.startedAt)} · {formatTime(rec.startedAt)}{rec.endedAt ? ` – ${formatTime(rec.endedAt)}` : ""}
            </p>
          )}
        </header>

        {active ? (
          <div className="space-y-3">
            <Alert>{t.tripSummary.stillRecording}</Alert>
            <ButtonLink href="/kayit-modu" variant="accent">{t.tripSummary.goRecording}</ButtonLink>
          </div>
        ) : rec ? (
          <>
            {rec.polyline === null && <Alert>{t.tripSummary.preparing}</Alert>}
            <dl className="grid grid-cols-2 gap-3" data-testid="summary-stats">
              <Stat label={t.tripSummary.totalDistance} value={formatDistance(rec.distanceM)} testId="sum-distance" big />
              <Stat label={t.tripSummary.totalDuration} value={formatDuration(rec.elapsedS)} testId="sum-elapsed" big />
              <Stat label={t.tripSummary.moving} value={formatDuration(rec.movingS)} testId="sum-moving" />
              <Stat label={t.tripSummary.stopped} value={formatDuration(Math.max(0, rec.elapsedS - rec.movingS))} testId="sum-stopped" />
              <Stat label={t.tripSummary.avgSpeed} value={formatSpeed(rec.averageKmh)} testId="sum-avg" />
              <Stat label={t.tripSummary.maxSpeed} value={formatSpeed(rec.maxKmh)} testId="sum-max" />
            </dl>
            {rec.pausedS > 0 && (
              <p className="text-sm text-stone-600">{t.tripSummary.paused}: {formatDuration(rec.pausedS)}</p>
            )}
            <p className="text-xs text-stone-500">{t.tripSummary.avgNote}</p>

            <dl className="space-y-3 text-sm">
              <Endpoint label={t.tripSummary.start} value={rec.startLabel} time={rec.startedAt} />
              <Endpoint label={t.tripSummary.end} value={rec.endLabel} time={rec.endedAt} />
            </dl>

            <p className="text-xs text-stone-500" data-testid="summary-points">
              {rec.pointCount === 0 ? t.tripSummary.noTrack : t.tripSummary.points(rec.pointCount)}
              {rec.rawPointCount === 0 && rec.pointCount > 0 && ` · ${t.tripSummary.rawDeleted}`}
            </p>
          </>
        ) : null}

        {!active && <SummaryActions tripId={trip.id} recordingId={rec?.recordingId ?? null} hasRawPoints={(rec?.rawPointCount ?? 0) > 0} />}
      </aside>
    </div>
  );
}

function Stat({ label, value, testId, big = false }: { label: string; value: string; testId: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-3">
      <dt className="text-[0.7rem] font-semibold tracking-wide text-stone-500 uppercase">{label}</dt>
      <dd className={big ? "mt-1 text-2xl font-extrabold tabular-nums" : "mt-1 text-lg font-bold tabular-nums"} data-testid={testId}>{value}</dd>
    </div>
  );
}

function Endpoint({ label, value, time }: { label: string; value: string | null; time: string | null }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 font-semibold text-stone-500">{label}</dt>
      <dd>
        {value ?? "—"}
        {time && <span className="ml-1.5 text-stone-500">{formatTime(time)}</span>}
      </dd>
    </div>
  );
}
