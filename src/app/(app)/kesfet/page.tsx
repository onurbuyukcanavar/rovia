import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreView } from "@/components/explore/explore-view";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { DEFAULT_CATEGORY, isExploreCategory } from "@/lib/explore/categories";
import { parseKonum } from "@/lib/explore/geo";
import { listFavoriteStops } from "@/lib/queries/favorites";
import { listPlannedTrips, listRouteTrips } from "@/lib/queries/trips";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.explore.title };

type SearchParams = Promise<{ kategori?: string | string[]; konum?: string | string[]; yolculuk?: string | string[] }>;

export default function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <ExploreLoader searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function ExploreLoader({ searchParams }: { searchParams: SearchParams }) {
  const [, params, routeTrips, planned, favorites] = await Promise.all([
    requireUser(), searchParams, listRouteTrips(), listPlannedTrips(), listFavoriteStops(),
  ]);
  const kategori = one(params.kategori);
  return (
    <ExploreView
      styleUrl={mapStyleUrl()}
      initialCategory={isExploreCategory(kategori) ? kategori : DEFAULT_CATEGORY}
      initialView={parseKonum(one(params.konum))}
      initialTripId={one(params.yolculuk) ?? null}
      routeTrips={routeTrips}
      plannedTrips={planned.map((p) => ({ id: p.id, title: p.title }))}
      favorites={favorites}
    />
  );
}

function ExploreSkeleton() {
  return (
    <div data-themed className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]" aria-label={t.common.loading}>
      <div className="order-1 h-[42%] animate-pulse bg-sunken lg:order-2 lg:h-full" />
      <div className="order-2 space-y-4 p-5 lg:order-1">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-fg/[0.05]" />)}
      </div>
    </div>
  );
}
