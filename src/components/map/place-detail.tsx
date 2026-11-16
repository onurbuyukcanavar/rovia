"use client";
import { ArrowLeft, BookOpen, Clock3, ExternalLink, Globe, LoaderCircle, MapPin, Mountain, Phone, Plus, Utensils } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { decodePolyline, insertionIndexForLegs, projectOntoPolyline } from "@/lib/geo";
import { mapsApi } from "@/lib/maps/client";
import { MAX_WAYPOINTS } from "@/lib/maps/explorer-state";
import type { FoundPlace, RouteOption, RouteOptions, Stop } from "@/lib/maps/types";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { formatDistance, formatDuration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type RouteContext = { route: RouteOption; origin: Stop; destination: Stop; waypoints: Stop[]; options?: RouteOptions };

type Props = {
  place: FoundPlace;
  routeContext: RouteContext | null;
  onAddAsWaypoint: (stop: Stop, index: number) => void;
  onSetEndpoint: (stop: Stop, which: "origin" | "destination") => void;
  onClose: () => void;
  /** Favorilere ekle / daha sonra git düğmeleri (oturum açmış kullanıcı) */
  favoriteActions?: ReactNode;
};

type Detour = { index: number; distanceMeters: number; durationSeconds: number };

const OSM_TYPES: Record<string, string> = { n: "node", w: "way", r: "relation" };

/** Yalnızca http(s) bağlantılara izin ver (OSM etiketleri kullanıcı girdisidir). */
function safeUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** "tr:Ankara Kalesi" → https://tr.wikipedia.org/wiki/Ankara_Kalesi */
function wikipediaUrl(raw: string | undefined): string | null {
  const m = raw?.match(/^([a-z]{2,3}):(.+)$/);
  return m ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].replace(/ /g, "_"))}` : null;
}

export function PlaceDetail({ place, routeContext, onAddAsWaypoint, onSetEndpoint, onClose, favoriteActions }: Props) {
  const stop: Stop = useMemo(
    () => ({ id: place.id, label: place.name, address: place.address, ref: place.id, location: place.location }),
    [place],
  );

  // Rotaya eklenirse: yerin rota boyunca konumuna göre doğru bacağa ekle ve yeni rotayı hesapla
  const insertIndex = useMemo(() => {
    if (!routeContext) return null;
    const path = decodePolyline(routeContext.route.encodedPolyline);
    const proj = projectOntoPolyline(place.location, path);
    const legs = routeContext.route.legs.map((l) => l.distanceMeters);
    return legs.length ? insertionIndexForLegs(proj.alongDistance, legs) : 0;
  }, [routeContext, place.location]);

  const canAdd = !!routeContext && routeContext.waypoints.length < MAX_WAYPOINTS;
  const detourKey =
    routeContext && insertIndex !== null && canAdd
      ? `${place.id}|${insertIndex}|${routeContext.route.distanceMeters}|${routeContext.waypoints.map((w) => w.id).join(",")}`
      : null;
  const detourReq = useKeyedRequest<Detour>(detourKey, async (signal) => {
    const waypoints = [...routeContext!.waypoints];
    waypoints.splice(insertIndex!, 0, stop);
    const r = await mapsApi.route({ origin: routeContext!.origin, destination: routeContext!.destination, waypoints, options: routeContext!.options }, { alternatives: false }, signal);
    return { index: insertIndex!, distanceMeters: r.routes[0].distanceMeters, durationSeconds: r.routes[0].durationSeconds };
  });
  const detour = detourReq.data ?? null;
  const deltaM = detour && routeContext ? detour.distanceMeters - routeContext.route.distanceMeters : 0;
  const deltaS = detour && routeContext ? detour.durationSeconds - routeContext.route.durationSeconds : 0;

  const tags = place.tags;
  const phone = tags.phone ?? tags["contact:phone"];
  const website = safeUrl(tags.website ?? tags["contact:website"]);
  const wiki = wikipediaUrl(tags.wikipedia);
  const osmUrl = `https://www.openstreetmap.org/${OSM_TYPES[place.id[0]] ?? "node"}/${place.id.slice(1)}`;
  const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
  const hasExtra = Boolean(tags.opening_hours || phone || website || wiki || tags.cuisine || tags.ele);

  return (
    <article aria-labelledby="place-title" className="space-y-4" data-testid="place-detail">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> {t.common.back}
      </button>

      <header>
        {place.typeLabel && <p className="eyebrow">{place.typeLabel}</p>}
        <h2 id="place-title" className="mt-1 text-xl font-extrabold tracking-tight">{place.name}</h2>
      </header>
      {favoriteActions}

      <dl className="space-y-2.5 text-sm">
        {(street || place.address) && (
          <div className="flex gap-2.5">
            <dt className="sr-only">Adres</dt>
            <MapPin className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd>{[street, place.address].filter(Boolean).join(", ")}</dd>
          </div>
        )}
        <div className="flex gap-2.5">
          <dt className="sr-only">{t.maps.distance}</dt>
          <span className="mt-0.5 size-4 shrink-0 text-center text-xs font-black text-stone-500" aria-hidden>↔</span>
          <dd className="font-semibold">
            {place.alongRoute !== null ? t.maps.fromRoute(formatDistance(place.distanceFromRoute)) : t.maps.fromCenter(formatDistance(place.distanceFromRoute))}
          </dd>
        </div>
        {tags.opening_hours && (
          <div className="flex gap-2.5">
            <dt className="sr-only">{t.maps.hours}</dt>
            <Clock3 className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd className="break-words">{tags.opening_hours === "24/7" ? "7 gün 24 saat açık" : tags.opening_hours}</dd>
          </div>
        )}
        {phone && (
          <div className="flex gap-2.5">
            <dt className="sr-only">{t.maps.phone}</dt>
            <Phone className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd><a href={`tel:${phone.split(";")[0].replace(/[^\d+]/g, "")}`} className="underline-offset-2 hover:underline">{phone.split(";")[0]}</a></dd>
          </div>
        )}
        {website && (
          <div className="flex gap-2.5">
            <dt className="sr-only">{t.maps.website}</dt>
            <Globe className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd className="min-w-0 truncate"><a href={website.href} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">{website.hostname}</a></dd>
          </div>
        )}
        {tags.cuisine && (
          <div className="flex gap-2.5"><dt className="sr-only">Mutfak</dt><Utensils className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden /><dd>{tags.cuisine.replace(/;/g, ", ")}</dd></div>
        )}
        {tags.ele && (
          <div className="flex gap-2.5"><dt className="sr-only">Yükseklik</dt><Mountain className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden /><dd>{tags.ele} m</dd></div>
        )}
        {wiki && (
          <div className="flex gap-2.5">
            <dt className="sr-only">{t.maps.wikipedia}</dt>
            <BookOpen className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd><a href={wiki} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{t.maps.wikipedia}</a></dd>
          </div>
        )}
      </dl>
      {!hasExtra && <p className="text-xs text-stone-600">{t.maps.noExtraInfo}</p>}

      {routeContext ? (
        <section className="rounded-2xl border border-ink-900/15 bg-ink-900/[0.03] p-4" aria-live="polite">
          <h3 className="text-sm font-bold">{t.maps.detourTitle}</h3>
          {detourReq.loading && detourKey && (
            <p className="mt-2 flex items-center gap-2 text-sm text-stone-600"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.maps.detourCalc}</p>
          )}
          {detourReq.error && <p className="mt-2 text-sm text-danger">{detourReq.error}</p>}
          {detour && !detourReq.loading && (
            <p className="mt-2 text-sm" data-testid="detour">
              <span className="font-extrabold tabular-nums">{formatDistance(detour.distanceMeters)} · {formatDuration(detour.durationSeconds)}</span>{" "}
              <span className="text-stone-600 tabular-nums">
                ({deltaM >= 0 ? "+" : "−"}{formatDistance(Math.abs(deltaM))}, {deltaS >= 0 ? "+" : "−"}{formatDuration(Math.abs(deltaS))})
              </span>
            </p>
          )}
          <Button className="mt-3 w-full" disabled={!canAdd || insertIndex === null}
            onClick={() => insertIndex !== null && onAddAsWaypoint(stop, insertIndex)}>
            <Plus className="size-4" aria-hidden /> {t.maps.addToRoute}
          </Button>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => onSetEndpoint(stop, "origin")}>{t.maps.origin}</Button>
          <Button variant="secondary" onClick={() => onSetEndpoint(stop, "destination")}>{t.maps.destination}</Button>
        </div>
      )}

      <a href={osmUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline">
        {t.maps.openInOsm} <ExternalLink className="size-3.5" aria-hidden />
      </a>
      <p className="text-[0.65rem] text-stone-500">{t.maps.dataNote}</p>
    </article>
  );
}
