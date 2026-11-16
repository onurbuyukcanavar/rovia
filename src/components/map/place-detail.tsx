"use client";
import { ArrowLeft, Clock3, ExternalLink, Globe, LoaderCircle, MapPin, Phone, Plus, Star } from "lucide-react";
import { useMemo } from "react";
import { decodePolyline, insertionIndexForLegs, projectOntoPolyline } from "@/lib/geo";
import { mapsApi, photoUrl } from "@/lib/maps/client";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { MAX_WAYPOINTS } from "@/lib/maps/explorer-state";
import type { FoundPlace, PlaceDetails, RouteOption, Stop } from "@/lib/maps/types";
import { formatCount, formatDistance, formatDuration } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

type RouteContext = {
  route: RouteOption;
  origin: Stop;
  destination: Stop;
  waypoints: Stop[];
  trafficAware: boolean;
};

type Props = {
  place: FoundPlace;
  routeContext: RouteContext | null;
  onAddAsWaypoint: (stop: Stop, index: number) => void;
  onSetEndpoint: (stop: Stop, which: "origin" | "destination") => void;
  onClose: () => void;
};

type Detour = { index: number; distanceMeters: number; durationSeconds: number };

export function PlaceDetail({ place, routeContext, onAddAsWaypoint, onSetEndpoint, onClose }: Props) {
  const detailsReq = useKeyedRequest<PlaceDetails>(place.id, (signal) => mapsApi.details(place.id, signal));
  const details = detailsReq.data ?? null;
  const error = detailsReq.error ?? null;

  const stop: Stop = useMemo(
    () => ({ id: place.id, label: place.name, address: place.address, placeId: place.id, location: place.location }),
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
      ? `${place.id}|${insertIndex}|${routeContext.trafficAware}|${routeContext.route.distanceMeters}|${routeContext.waypoints.map((w) => w.id).join(",")}`
      : null;
  const detourReq = useKeyedRequest<Detour>(detourKey, async (signal) => {
    const waypoints = [...routeContext!.waypoints];
    waypoints.splice(insertIndex!, 0, stop);
    const r = await mapsApi.route(
      { origin: routeContext!.origin, destination: routeContext!.destination, waypoints },
      { alternatives: false, trafficAware: routeContext!.trafficAware },
      signal,
    );
    return { index: insertIndex!, distanceMeters: r.routes[0].distanceMeters, durationSeconds: r.routes[0].durationSeconds };
  });
  const detour = detourReq.data ?? null;
  const detourError = detourReq.error ?? null;
  const detourLoading = detourReq.loading;

  const d = details;
  const deltaKm = detour && routeContext ? detour.distanceMeters - routeContext.route.distanceMeters : 0;
  const deltaS = detour && routeContext ? detour.durationSeconds - routeContext.route.durationSeconds : 0;

  return (
    <article aria-labelledby="place-title" className="space-y-4" data-testid="place-detail">
      <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> {t.common.back}
      </button>

      {d?.photo && (
        <figure className="overflow-hidden rounded-2xl bg-sand-100">
          {/* eslint-disable-next-line @next/next/no-img-element -- Google'ın geçici görsel adresi; Next Image önbelleği Places şartlarına aykırı olur */}
          <img src={photoUrl(d.photo.name, 800)} alt={d.name} className="aspect-[16/10] w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          {d.photo.attributions.length > 0 && (
            <figcaption className="px-3 py-1.5 text-[0.65rem] text-stone-600">
              {t.maps.photoBy}{" "}
              {d.photo.attributions.map((a, i) => (
                <span key={i}>
                  {i > 0 && ", "}
                  {a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">{a.name}</a> : a.name}
                </span>
              ))}
            </figcaption>
          )}
        </figure>
      )}

      <header>
        {(d?.typeLabel ?? place.typeLabel) && <p className="eyebrow">{d?.typeLabel ?? place.typeLabel}</p>}
        <h2 id="place-title" className="mt-1 text-xl font-extrabold tracking-tight">{d?.name ?? place.name}</h2>
        {d?.rating != null && (
          <p className="mt-1 flex items-center gap-1.5 text-sm">
            <Star className="size-4 fill-amber-500 text-amber-500" aria-hidden />
            <span className="font-bold">{d.rating.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
            {d.ratingCount != null && <span className="text-stone-600">· {t.maps.reviews(formatCount(d.ratingCount))}</span>}
          </p>
        )}
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {!d && !error && <div className="h-24 animate-pulse rounded-xl bg-sand-100" aria-label={t.common.loading} />}

      <dl className="space-y-2.5 text-sm">
        {(d?.address ?? place.address) && (
          <div className="flex gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden /><dd>{d?.address ?? place.address}</dd></div>
        )}
        <div className="flex gap-2.5">
          <span className="mt-0.5 size-4 shrink-0 text-center text-xs font-black text-stone-500" aria-hidden>↔</span>
          <dd className="font-semibold">
            {place.alongRoute !== null ? t.maps.fromRoute(formatDistance(place.distanceFromRoute)) : t.maps.fromCenter(formatDistance(place.distanceFromRoute))}
          </dd>
        </div>
        {d?.openNow != null && (
          <div className="flex gap-2.5">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd className={d.openNow ? "font-semibold text-success" : "font-semibold text-danger"}>{d.openNow ? t.maps.openNow : t.maps.closedNow}</dd>
          </div>
        )}
        {d?.phone && (
          <div className="flex gap-2.5"><Phone className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd><a href={`tel:${(d.phoneInternational ?? d.phone).replace(/\s/g, "")}`} className="underline-offset-2 hover:underline">{d.phone}</a></dd></div>
        )}
        {d?.website && (
          <div className="flex gap-2.5"><Globe className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
            <dd className="min-w-0 truncate"><a href={d.website} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{new URL(d.website).hostname}</a></dd></div>
        )}
      </dl>

      {d && d.openingHours.length > 0 && (
        <details className="rounded-xl border border-sand-200 bg-white px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold">{t.maps.hours}</summary>
          <ul className="mt-2 space-y-0.5 text-stone-700">{d.openingHours.map((h) => <li key={h}>{h}</li>)}</ul>
        </details>
      )}

      {routeContext ? (
        <section className="rounded-2xl border border-ink-900/15 bg-ink-900/[0.03] p-4" aria-live="polite">
          <h3 className="text-sm font-bold">{t.maps.detourTitle}</h3>
          {detourLoading && <p className="mt-2 flex items-center gap-2 text-sm text-stone-600"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.maps.detourCalc}</p>}
          {detourError && <p className="mt-2 text-sm text-danger">{detourError}</p>}
          {detour && !detourLoading && (
            <p className="mt-2 text-sm" data-testid="detour">
              <span className="font-extrabold tabular-nums">{formatDistance(detour.distanceMeters)} · {formatDuration(detour.durationSeconds)}</span>{" "}
              <span className="text-stone-600 tabular-nums">
                ({deltaKm >= 0 ? "+" : "−"}{formatDistance(Math.abs(deltaKm))}, {deltaS >= 0 ? "+" : "−"}{formatDuration(Math.abs(deltaS))})
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

      {d?.googleMapsUri && (
        <a href={d.googleMapsUri} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline">
          {t.maps.openInGoogleMaps} <ExternalLink className="size-3.5" aria-hidden />
        </a>
      )}
      <p className="text-[0.65rem] text-stone-500">Veriler: Google Haritalar</p>
    </article>
  );
}
