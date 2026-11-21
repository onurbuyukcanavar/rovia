import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import {
  EntryList, Panel, QuickActions, SavedPlaceList, StatsGrid, TripList,
} from "@/components/dashboard/sections";
import { PanelHero, PanelNight } from "@/components/dashboard/hero";
import { HeroConditions } from "@/components/dashboard/hero-conditions";
import { firstName, requireUser } from "@/lib/dal";
import { getDashboardData } from "@/lib/queries/dashboard";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.nav.overview };

export default function DashboardPage() {
  return (
    <PanelNight>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-5 sm:space-y-12 sm:px-8 sm:py-8">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-[2rem] border border-paper/[0.06] bg-paper/[0.04] sm:h-96" />}>
          <Greeting />
        </Suspense>
        <QuickActions index={1} />
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData />
        </Suspense>
      </div>
    </PanelNight>
  );
}

async function Greeting() {
  const user = await requireUser();
  return (
    <PanelHero
      eyebrow={t.nav.overview}
      aside={<HeroConditions />}
      title={t.dashboard.greeting(firstName(user))}
      accent={t.dashboard.welcomeBody}
      body={t.dashboard.hero.body}
      cta={
        <ButtonLink href="/planla" variant="accent" size="lg" className="shadow-[0_10px_30px_-10px_rgb(232_145_45/0.7)]">
          {t.dashboard.actions.plan} <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
      }
    />
  );
}

async function DashboardData() {
  const [, data] = await Promise.all([requireUser(), getDashboardData()]);
  return (
    <>
      <StatsGrid stats={data.stats} index={2} />
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-2">
        <Panel index={3} id="recent-trips" title={t.dashboard.recentTrips}><TripList trips={data.recentTrips} empty={t.dashboard.emptyRecent} /></Panel>
        <Panel index={4} id="upcoming-trips" title={t.dashboard.upcomingTrips}><TripList trips={data.upcomingTrips} empty={t.dashboard.emptyUpcoming} /></Panel>
        <Panel index={5} id="saved-places" title={t.dashboard.savedPlaces}><SavedPlaceList places={data.savedPlaces} /></Panel>
        <Panel index={6} id="recent-entries" title={t.dashboard.recentEntries}><EntryList entries={data.recentEntries} /></Panel>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-10" aria-label={t.common.loading}>
      <div className="h-32 animate-pulse rounded-[var(--radius-card)] bg-paper/[0.05]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-44 animate-pulse rounded-[var(--radius-card)] bg-paper/[0.05]" />)}
      </div>
    </div>
  );
}
