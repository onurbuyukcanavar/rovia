import type { Metadata } from "next";
import { Suspense } from "react";
import { FileUp, Flag, Plus, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionTitle } from "@/components/ui/section-eyebrow";
import { TripCards } from "@/components/trips/trip-cards";
import { ActiveRecordingBanner } from "@/components/trips/active-banner";
import { requireUser } from "@/lib/dal";
import { listPlannedTrips } from "@/lib/queries/trips";
import { getActiveRecording } from "@/lib/queries/recordings";
import { listArchive } from "@/lib/queries/journal";
import { CompletedTrips } from "@/components/trips/completed-trips";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.trips.listTitle };

export default function TripsPage() {
  return (
    <div data-themed className="page-backdrop min-h-full">
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-6 sm:px-8 sm:py-10">
        <PageHeader
          eyebrow={t.nav.tripsShort}
          index={1}
          title={t.trips.listTitle}
          accent={t.trips.listAccent}
          description={t.trips.listSubtitle}
          actions={
            <>
              <ButtonLink href="/yolculuklar/ice-aktar" variant="secondary" data-testid="import-track-link">
                <FileUp className="size-4" aria-hidden /> {t.tools.import.link}
              </ButtonLink>
              <ButtonLink href="/planla" variant="accent">
                <Plus className="size-4" aria-hidden /> {t.trips.newTrip}
              </ButtonLink>
            </>
          }
        />
        <Suspense fallback={<ListSkeleton />}>
          <ActiveBanner />
          <section className="space-y-4" aria-labelledby="planned-heading">
            <SectionTitle index={2} id="planned-heading">{t.tripSummary.plannedSection}</SectionTitle>
            <TripList />
          </section>
          <section className="space-y-4" aria-labelledby="completed-heading">
            <SectionTitle index={3} id="completed-heading">{t.tripSummary.completedSection}</SectionTitle>
            <CompletedList />
          </section>
        </Suspense>
        <p className="text-sm text-fg-subtle">{t.trips.historyNote}</p>
      </div>
    </div>
  );
}

async function TripList() {
  const [, trips] = await Promise.all([requireUser(), listPlannedTrips()]);
  if (!trips.length) return <EmptyState icon={Route}>{t.trips.empty}</EmptyState>;
  return <TripCards trips={trips} />;
}

async function ActiveBanner() {
  const [, active] = await Promise.all([requireUser(), getActiveRecording()]);
  if (!active) return null;
  return <ActiveRecordingBanner title={active.title} />;
}

async function CompletedList() {
  const [, trips] = await Promise.all([requireUser(), listArchive()]);
  if (!trips.length) return <EmptyState icon={Flag}>{t.tripSummary.emptyCompleted}</EmptyState>;
  return <CompletedTrips trips={trips} />;
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t.common.loading}>
      {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-[var(--radius-card)] bg-sunken" />)}
    </div>
  );
}
