"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maps/maplibre-setup";
import MapView, { NavigationControl, ScaleControl, type MapRef, type ViewStateChangeEvent } from "react-map-gl/maplibre";
import { useMemo, useRef, useState } from "react";
import { LoaderCircle, LocateFixed, ZoomIn } from "lucide-react";
import { decodePolyline, haversine, type LatLng } from "@/lib/geo";
import { mapsApi } from "@/lib/maps/client";
import { useGeolocation } from "@/lib/maps/use-geolocation";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { CATEGORY_COLORS, RADIUS_OPTIONS, type ExploreCategory } from "@/lib/explore/categories";
import { bboxAround, normalizeBbox, type BBox } from "@/lib/explore/geo";
import { toFoundPlace, type ExplorePlace, type ExploreResponse, type RouteTrip } from "@/lib/explore/types";
import type { FavoriteStopItem, ListType } from "@/lib/favorites/types";
import { formatDistance } from "@/lib/format";
import { FavoriteActions } from "@/components/favorites/favorite-actions";
import { MapFrame, isMobileViewport, useMapExpand } from "@/components/map/map-frame";
import { FitBounds, MyLocationMarker, PanTo } from "@/components/map/map-layers";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { fieldClass } from "@/components/journal/note-editor";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { CategoryChips, CATEGORY_ICONS } from "./category-chips";
import { ExploreMarkers, TripLine } from "./explore-markers";
import { PlacePanel } from "./place-panel";

const E = t.explore;
const TURKEY = { lat: 39.0, lng: 35.2, zoom: 6 };
const NEAR_KM = 25;
const LIMIT = 150;

type Mode = "area" | "route" | "near";

type Props = {
  styleUrl: string;
  initialCategory: ExploreCategory;
  initialView: { lat: number; lng: number; zoom: number } | null;
  initialTripId: string | null;
  routeTrips: RouteTrip[];
  plannedTrips: { id: string; title: string }[];
  favorites: FavoriteStopItem[];
};

const boundsOf = (e: { target: { getBounds: () => { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number } } }): BBox => {
  const b = e.target.getBounds();
  return normalizeBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
};

/** ROVIA Keşfet: kategori + alan (harita / rota boyunca / yakınımda) ile ilgi çekici yerler. */
export function ExploreView({ styleUrl, initialCategory, initialView, initialTripId, routeTrips, plannedTrips, favorites }: Props) {
  const startTrip = initialTripId && routeTrips.some((r) => r.id === initialTripId) ? initialTripId : null;
  const [category, setCategory] = useState<ExploreCategory>(initialCategory);
  const [mode, setMode] = useState<Mode>(startTrip ? "route" : "area");
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [tripId, setTripId] = useState<string>(startTrip ?? routeTrips[0]?.id ?? "");
  const [radius, setRadius] = useState<number>(5_000);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState(false);
  const [savedRefs, setSavedRefs] = useState<Map<string, ListType>>(
    () => new Map(favorites.filter((f) => f.osmRef).map((f) => [f.osmRef!, f.listType])),
  );
  const mapRef = useRef<MapRef>(null);
  const mapView = useMapExpand();
  const geo = useGeolocation();

  const trip = mode === "route" ? routeTrips.find((r) => r.id === tripId) ?? null : null;
  const nearBox = mode === "near" && geo.position ? bboxAround(geo.position, NEAR_KM) : null;

  // ---------------------------------------------------------------- İstek
  const reqKey =
    mode === "area" ? (bbox ? `area|${category}|${bbox.join(",")}` : null)
      : mode === "route" ? (trip ? `route|${category}|${radius}|${trip.id}` : null)
        : nearBox ? `near|${category}|${nearBox.join(",")}` : null;
  const req = useKeyedRequest<ExploreResponse>(
    reqKey,
    (signal) =>
      trip
        ? mapsApi.explore({ category, encodedPolyline: trip.polyline, radiusMeters: radius, limit: LIMIT }, signal)
        : mapsApi.explore({ category, bbox: (mode === "near" ? nearBox : bbox)!, limit: LIMIT }, signal),
    { delayMs: mode === "area" ? 450 : 100, keepPrevious: mode === "area" },
  );
  const places = useMemo(() => req.data?.places ?? [], [req.data]);
  const tooLarge = !req.loading && !!req.data?.tooLarge;
  const selected = places.find((p) => p.id === selectedId) ?? null;

  // ---------------------------------------------------------------- Kamera
  const tripPath = useMemo(() => (trip ? decodePolyline(trip.polyline) : []), [trip]);
  const fit = mode === "route" ? { points: tripPath, key: `t:${trip?.id ?? ""}` }
    : nearBox && geo.position ? { points: [{ lat: nearBox[1], lng: nearBox[0] }, { lat: nearBox[3], lng: nearBox[2] }], key: `n:${nearBox.join(",")}` }
      : { points: [] as LatLng[], key: "none" };

  const onMoveEnd = (e: ViewStateChangeEvent) => setBbox(boundsOf(e));

  const select = (p: ExplorePlace | null) => {
    setSelectedId(p?.id ?? null);
    if (p && mapView.expanded) mapView.collapse();
  };

  const chooseMode = async (m: Mode) => {
    setMode(m);
    setSelectedId(null);
    if (m === "near" && !geo.position) await geo.locate();
  };

  const distanceText = (p: ExplorePlace): string | null => {
    if (mode === "route" && p.alongM !== null) {
      return `${E.afterKm(formatDistance(p.alongM))} · ${E.fromRoute(formatDistance(p.distanceM ?? 0))}`;
    }
    if (mode === "near" && geo.position) return E.fromYou(formatDistance(haversine(geo.position, p.location)));
    return null;
  };

  const color = CATEGORY_COLORS[category];
  const Icon = CATEGORY_ICONS[category];

  return (
    <div className="relative flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr] lg:overflow-hidden">
      <MapFrame expanded={mapView.expanded} onExpand={mapView.expand} onCollapse={mapView.collapse}
        className="order-1 h-[42%] shrink-0 lg:order-2 lg:h-full" testId="map">
        <MapView
          ref={mapRef}
          initialViewState={{
            longitude: initialView?.lng ?? TURKEY.lng, latitude: initialView?.lat ?? TURKEY.lat, zoom: initialView?.zoom ?? TURKEY.zoom,
          }}
          mapStyle={styleUrl}
          style={{ width: "100%", height: "100%" }}
          onLoad={(e) => {
            const b = e.target.getBounds();
            setBbox(normalizeBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]));
          }}
          onMoveEnd={onMoveEnd}
          onClick={() => {
            if (!mapView.expanded && isMobileViewport()) mapView.expand();
          }}
          onError={(e) => {
            console.error("[rovia] harita:", e.error?.message);
            setMapError(true);
          }}
          attributionControl={{ compact: true }}
          dragRotate={false}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <ScaleControl position="bottom-left" unit="metric" />
          {trip && <TripLine polyline={trip.polyline} />}
          <ExploreMarkers places={places} color={color} selectedId={selectedId} onSelect={select} />
          <MyLocationMarker position={mode === "near" ? geo.position : null} />
          <FitBounds points={fit.points} deps={fit.key} />
          <PanTo position={selected?.location ?? null} />
        </MapView>
        {mapError && (
          <div className="absolute inset-x-3 top-14 z-10"><Alert tone="error">{t.maps.loadError}</Alert></div>
        )}
        {mode === "area" && tooLarge && (
          <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center px-3">
            <Button type="button" size="sm" className="shadow-lg" onClick={() => mapRef.current?.zoomIn({ duration: 400 })}>
              <ZoomIn className="size-4" aria-hidden /> {E.zoomIn}
            </Button>
          </div>
        )}
        {req.loading && reqKey && (
          <div className="pointer-events-none absolute top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-paper/95 px-3 py-1.5 text-xs font-semibold shadow">
            <LoaderCircle className="mr-1 inline size-3.5 animate-spin" aria-hidden /> {E.loading}
          </div>
        )}
      </MapFrame>

      <aside className="relative order-2 min-h-0 flex-1 overflow-y-auto border-t border-sand-200 bg-paper px-4 py-4 lg:order-1 lg:border-t-0 lg:border-r lg:px-5 lg:py-6">
        {selected ? (
          <PlacePanel key={selected.id} place={selected} category={category} distanceText={distanceText(selected)}
            plannedTrips={plannedTrips} onBack={() => setSelectedId(null)}
            favoriteActions={
              <FavoriteActions place={toFoundPlace(selected)} saved={savedRefs.get(selected.id) ?? null}
                onSaved={(list) => setSavedRefs((m) => new Map(m).set(selected.id, m.get(selected.id) ?? list))} />
            } />
        ) : (
          <div className="space-y-4">
            <header className="hidden lg:block">
              <h1 className="text-2xl font-extrabold tracking-tight">{E.title}</h1>
              <p className="text-sm text-stone-600">{E.subtitle}</p>
            </header>
            <h1 className="sr-only lg:hidden">{E.title}</h1>

            <CategoryChips value={category} onChange={(c) => { setCategory(c); setSelectedId(null); }} />

            <fieldset>
              <legend className="eyebrow mb-2">{E.modesLabel}</legend>
              <div className="grid grid-cols-3 gap-1 rounded-full border border-sand-300 bg-paper-50 p-1" data-testid="explore-modes">
                {(["area", "route", "near"] as const).map((m) => (
                  <label key={m} className={cn(
                    "relative cursor-pointer rounded-full px-2 py-1.5 text-center text-sm font-semibold transition select-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-amber-400/25",
                    mode === m ? "bg-ink-900 text-paper" : "text-ink-900 hover:bg-sand-100",
                  )}>
                    <input type="radio" name="explore-mode" className="sr-only" checked={mode === m} onChange={() => void chooseMode(m)} />
                    {E.modes[m]}
                  </label>
                ))}
              </div>
            </fieldset>

            {mode === "area" && <p className="text-xs text-stone-600">{E.areaHint}</p>}
            {mode === "route" && (
              routeTrips.length === 0 ? (
                <div className="space-y-2">
                  <Alert>{E.noRouteTrips}</Alert>
                  <ButtonLink href="/planla" size="sm" variant="secondary">{E.planTrip}</ButtonLink>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <label className="min-w-0">
                    <span className="mb-1 block text-xs font-semibold text-stone-600">{E.tripLabel}</span>
                    <select className={cn(fieldClass, "h-10 text-sm")} value={tripId} onChange={(e) => { setTripId(e.target.value); setSelectedId(null); }}
                      data-testid="explore-trip">
                      {routeTrips.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-stone-600">{E.radiusLabel}</span>
                    <select className={cn(fieldClass, "h-10 text-sm")} value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                      {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{E.radius(r / 1000)}</option>)}
                    </select>
                  </label>
                </div>
              )
            )}
            {mode === "near" && (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-xs text-stone-600">{E.nearHint}</p>
                <Button type="button" size="sm" variant="secondary" disabled={geo.status === "locating"} onClick={() => void geo.locate()}>
                  <LocateFixed className="size-4" aria-hidden /> {geo.status === "locating" ? E.locating : E.locate}
                </Button>
              </div>
            )}
            {mode === "near" && geo.error && <Alert tone="error">{geo.error}</Alert>}

            <section aria-labelledby="explore-results" aria-busy={req.loading} className="space-y-2">
              <h2 id="explore-results" className="flex items-center gap-2 text-sm font-bold">
                <Icon className="size-4" style={{ color }} aria-hidden /> {E.categories[category]}
                {reqKey && !req.loading && !tooLarge && !req.error && (
                  <span className="font-normal text-stone-500" data-testid="explore-count">· {E.results(places.length)}</span>
                )}
              </h2>
              {!reqKey ? (
                mode === "near" ? <p className="text-sm text-stone-600">{E.needLocation}</p>
                  : mode === "route" && routeTrips.length > 0 ? <p className="text-sm text-stone-600">{E.pickTrip}</p>
                    : null
              ) : req.error ? (
                <Alert tone="error">{req.error}</Alert>
              ) : tooLarge ? (
                <Alert>{E.tooLarge}</Alert>
              ) : req.loading && places.length === 0 ? (
                <ul className="space-y-2" aria-label={E.loading}>
                  {[0, 1, 2, 3].map((i) => <li key={i} className="h-14 animate-pulse rounded-xl bg-sand-100" />)}
                </ul>
              ) : places.length === 0 ? (
                <p className="text-sm text-stone-600">{mode === "route" ? E.emptyRoute : E.empty}</p>
              ) : (
                <ol className={cn("divide-y divide-sand-100 rounded-2xl border border-sand-200 bg-paper-50", req.loading && "opacity-60")}
                  aria-label={E.listLabel} data-testid="explore-list">
                  {places.map((p, i) => {
                    const dist = distanceText(p);
                    return (
                      <li key={p.id}>
                        <button type="button" onClick={() => select(p)}
                          className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-white focus-visible:bg-white">
                          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[0.62rem] font-extrabold text-white tabular-nums"
                            style={{ backgroundColor: color }} aria-hidden>{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{p.name}</span>
                            <span className="block truncate text-xs text-stone-600">
                              {[p.typeLabel, p.admin].filter(Boolean).join(" · ") || "—"}
                            </span>
                            {dist && <span className="block text-xs font-semibold text-stone-700 tabular-nums">{dist}</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="text-[0.65rem] text-stone-500">
                {t.explore.place.sourceTitle}: {t.explore.place.sourceOsm} ·{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">openstreetmap.org/copyright</a>
              </p>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
