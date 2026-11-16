import type { Metadata } from "next";
import { Suspense } from "react";
import { FavoritesView } from "@/components/favorites/favorites-view";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { listFavorites } from "@/lib/queries/favorites";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.favorites.title };

export default function FavoritesPage() {
  return (
    <Suspense fallback={<FavoritesSkeleton />}>
      <FavoritesLoader />
    </Suspense>
  );
}

async function FavoritesLoader() {
  await requireUser();
  const places = await listFavorites();
  return <FavoritesView styleUrl={mapStyleUrl()} places={places} />;
}

function FavoritesSkeleton() {
  return (
    <div className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[28rem_1fr]" aria-label={t.common.loading}>
      <div className="order-1 h-[40%] animate-pulse bg-sand-100 lg:order-2 lg:h-full" />
      <div className="order-2 space-y-4 p-5 lg:order-1">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-sand-100" />)}
      </div>
    </div>
  );
}
