import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/dashboard/sections";
import { TripCards } from "@/components/trips/trip-cards";
import { requireUser } from "@/lib/dal";
import { listPlannedTrips } from "@/lib/queries/trips";
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
        <TripList />
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

function ListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t.common.loading}>
      {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-sand-100" />)}
    </div>
  );
}
