import { MapExplorer } from "@/components/map/map-explorer";
import { favoriteToStopServer } from "@/lib/favorites/stop";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { listFavoriteStops } from "@/lib/queries/favorites";
import { stopFromSearchParams } from "@/lib/explore/place-param";
import { t } from "@/i18n";

/** Haritayı Keşfet / Yeni yolculuk: kullanıcının kayıtlı yerleriyle birlikte yüklenir. */
type Params = Record<string, string | string[] | undefined>;

export async function ExplorerLoader({ mode, searchParams }: { mode: "explore" | "plan"; searchParams?: Promise<Params> }) {
  const [, favorites, params] = await Promise.all([requireUser(), listFavoriteStops(), searchParams ?? Promise.resolve({} as Params)]);
  const hedef = typeof params.hedef === "string" ? params.hedef : null;
  const target = hedef ? favorites.find((f) => f.id === hedef) : undefined;
  // Keşfet → "Bu yere yeni rota planla": ?yer=<osm>&ad=…&konum=lat,lng
  const place = target ? null : stopFromSearchParams(params);
  const destination = target ? favoriteToStopServer(target) : place;
  return (
    <MapExplorer key={hedef ?? place?.id ?? mode} styleUrl={mapStyleUrl()} mode={mode} favorites={favorites}
      initialDestination={destination} />
  );
}

export function ExplorerSkeleton() {
  return (
    <div className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]" aria-label={t.common.loading}>
      <div className="order-1 h-[42%] animate-pulse bg-sand-100 lg:order-2 lg:h-full" />
      <div className="order-2 space-y-4 p-5 lg:order-1">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}
      </div>
    </div>
  );
}
