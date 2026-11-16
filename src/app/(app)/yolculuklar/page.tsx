import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CircleDot, Flag, Plus, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/sections";
import { TripCards } from "@/components/trips/trip-cards";
import { requireUser } from "@/lib/dal";
import { listPlannedTrips } from "@/lib/queries/trips";
import { getActiveRecording, listCompletedTrips } from "@/lib/queries/recordings";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.trips.listTitle };

export default function TripsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={t.nav.trips}
        title={t.trips.listTitle}
        description={t.trips.listSubtitle}
        actions={
          <ButtonLink href="/planla" variant="accent">
            <Plus className="size-4" aria-hidden /> {t.trips.newTrip}
          </ButtonLink>
        }
      />
      <Suspense fallback={<ListSkeleton />}>
        <ActiveBanner />
        <section className="space-y-4" aria-labelledby="planned-heading">
          <h2 id="planned-heading" className="text-lg font-bold">{t.tripSummary.plannedSection}</h2>
          <TripList />
        </section>
        <section className="space-y-4" aria-labelledby="completed-heading">
          <h2 id="completed-heading" className="text-lg font-bold">{t.tripSummary.completedSection}</h2>
          <CompletedList />
        </section>
      </Suspense>
      <p className="text-sm text-stone-500">{t.trips.historyNote}</p>
    </div>
  );
}

async function TripList() {
  await requireUser();
  const trips = await listPlannedTrips();
  if (!trips.length) return <EmptyState icon={Route}>{t.trips.empty}</EmptyState>;
  return <TripCards trips={trips} />;
}

async function ActiveBanner() {
  await requireUser();
  const active = await getActiveRecording();
  if (!active) return null;
  return (
    <Link href="/kayit-modu" className="flex items-center gap-3 rounded-2xl bg-danger px-5 py-4 font-semibold text-white shadow-md hover:opacity-95" data-testid="active-recording-banner">
      <CircleDot className="size-5 animate-pulse" aria-hidden />
      <span className="flex-1">{t.tripSummary.activeBanner}: {active.title}</span>
      <span className="text-sm underline">{t.tripSummary.goRecording}</span>
    </Link>
  );
}

async function CompletedList() {
  await requireUser();
  const trips = await listCompletedTrips();
  if (!trips.length) return <EmptyState icon={Flag}>{t.tripSummary.emptyCompleted}</EmptyState>;
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="completed-list">
      {trips.map((trip) => (
        <li key={trip.id}>
          <Link href={`/yolculuklar/${trip.id}`} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-md" data-testid="completed-card">
            <p className="text-lg leading-snug font-bold">{trip.title}</p>
            {(trip.startLabel || trip.endLabel) && (
              <p className="mt-1 truncate text-sm text-stone-600">{[trip.startLabel, trip.endLabel].filter(Boolean).join(" → ")}</p>
            )}
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600 tabular-nums">
              <span>{formatDate(trip.endedAt)}</span>
              <span className="font-semibold text-ink-900">{formatDistance(trip.distanceM)}</span>
              <span>{formatDuration(trip.elapsedS)}</span>
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t.common.loading}>
      {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-sand-100" />)}
    </div>
  );
}
