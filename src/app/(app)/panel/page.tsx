import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import {
  EntryList, Panel, QuickActions, SavedPlaceList, StatsGrid, TripList,
} from "@/components/dashboard/sections";
import { firstName, requireUser } from "@/lib/dal";
import { getDashboardData } from "@/lib/queries/dashboard";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.nav.overview };

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <Suspense fallback={<div className="h-16 w-72 animate-pulse rounded-xl bg-sand-100" />}>
        <Greeting />
      </Suspense>
      <QuickActions />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const user = await requireUser();
  return <PageHeader eyebrow={t.nav.overview} title={t.dashboard.greeting(firstName(user))} description={t.dashboard.welcomeBody} />;
}

async function DashboardData() {
  await requireUser();
  const data = await getDashboardData();
  return (
    <>
      <StatsGrid stats={data.stats} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t.dashboard.recentTrips}><TripList trips={data.recentTrips} empty={t.dashboard.emptyRecent} /></Panel>
        <Panel title={t.dashboard.upcomingTrips}><TripList trips={data.upcomingTrips} empty={t.dashboard.emptyUpcoming} /></Panel>
        <Panel title={t.dashboard.savedPlaces}><SavedPlaceList places={data.savedPlaces} /></Panel>
        <Panel title={t.dashboard.recentEntries}><EntryList entries={data.recentEntries} /></Panel>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-label={t.common.loading}>
      <div className="h-28 animate-pulse rounded-2xl bg-sand-100" />
      <div className="grid gap-5 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-sand-100" />)}
      </div>
    </div>
  );
}
