"use client";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import { useEffect, useMemo } from "react";
import { boundsOf, decodePolyline, type LatLng } from "@/lib/geo";
import type { FoundPlace, RouteOption, Stop } from "@/lib/maps/types";
import { cn } from "@/lib/cn";

export const ALT_ROUTE_LAYER = "route-alt";

/** Rotalar: seçili rota lacivert kontur + amber dolgu; alternatifler gri ve tıklanabilir (layer id: route-alt). */
export function RouteLines({ routes, selected }: { routes: RouteOption[]; selected: number }) {
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: routes.map((r, i) => ({
        type: "Feature" as const,
        properties: { index: i, selected: i === selected },
        geometry: { type: "LineString" as const, coordinates: decodePolyline(r.encodedPolyline).map((p) => [p.lng, p.lat]) },
      })),
    }),
    [routes, selected],
  );
  return (
    <Source id="routes" type="geojson" data={data}>
      <Layer id={ALT_ROUTE_LAYER} type="line" filter={["==", ["get", "selected"], false]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#7b879b", "line-width": 6, "line-opacity": 0.85 }} />
      <Layer id="route-casing" type="line" filter={["==", ["get", "selected"], true]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#0e1726", "line-width": 9 }} />
      <Layer id="route-main" type="line" filter={["==", ["get", "selected"], true]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#e8912d", "line-width": 4.5 }} />
    </Source>
  );
}

export function StopPin({ label, tone }: { label: string; tone: "origin" | "waypoint" | "destination" }) {
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-full border-[3px] text-xs font-extrabold shadow-md",
        tone === "origin" && "border-paper bg-ink-900 text-paper",
        tone === "waypoint" && "border-ink-900 bg-paper text-ink-900",
        tone === "destination" && "border-ink-900 bg-amber-500 text-ink-950",
      )}
    >
      {label}
    </span>
  );
}

export function StopMarkers({ origin, waypoints, destination }: { origin: Stop | null; waypoints: (Stop | null)[]; destination: Stop | null }) {
  return (
    <>
      {waypoints.map((w, i) =>
        w ? (
          <Marker key={`${w.id}-${i}`} longitude={w.location.lng} latitude={w.location.lat} anchor="center">
            <span title={w.label}><StopPin label={String(i + 1)} tone="waypoint" /></span>
          </Marker>
        ) : null,
      )}
      {origin && (
        <Marker longitude={origin.location.lng} latitude={origin.location.lat} anchor="center">
          <span title={origin.label}><StopPin label="A" tone="origin" /></span>
        </Marker>
      )}
      {destination && (
        <Marker longitude={destination.location.lng} latitude={destination.location.lat} anchor="center">
          <span title={destination.label}><StopPin label="B" tone="destination" /></span>
        </Marker>
      )}
    </>
  );
}

export function ResultMarkers({ places, selectedId, onSelect }: { places: FoundPlace[]; selectedId: string | null; onSelect: (p: FoundPlace) => void }) {
  return (
    <>
      {places.map((p) => {
        const active = p.id === selectedId;
        return (
          <Marker key={p.id} longitude={p.location.lng} latitude={p.location.lat} anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(p);
            }}>
            <button type="button" aria-label={p.name} title={p.name}
              className={cn(
                "block rounded-full border-2 border-ink-900 shadow transition-transform",
                active ? "size-5 scale-110 bg-amber-500" : "size-3.5 bg-white hover:scale-125",
              )} />
          </Marker>
        );
      })}
    </>
  );
}

export function MyLocationMarker({ position }: { position: LatLng | null }) {
  if (!position) return null;
  return (
    <Marker longitude={position.lng} latitude={position.lat} anchor="center">
      <span className="relative block size-4" title="Konumum">
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-500/40" />
        <span className="absolute inset-0 rounded-full border-2 border-white bg-sky-600 shadow" />
      </span>
    </Marker>
  );
}

/** Rota veya duraklar değişince kamerayı hepsini gösterecek şekilde ayarlar. */
export function FitBounds({ points, deps }: { points: LatLng[]; deps: unknown }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.flyTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(map.getZoom(), 11), duration: 600 });
      return;
    }
    const b = boundsOf(points);
    if (b) map.fitBounds([[b.west, b.south], [b.east, b.north]], { padding: 56, duration: 600, maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca anlamlı değişikliklerde (deps) odaklan
  }, [map, deps]);
  return null;
}

export function PanTo({ position }: { position: LatLng | null }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (map && position) map.easeTo({ center: [position.lng, position.lat], duration: 400 });
  }, [map, position]);
  return null;
}

/** Rota üzerinde önerilen yerler: amber yıldız işaretler. */
export function SuggestionMarkers({ places, selectedId, onSelect }: { places: FoundPlace[]; selectedId: string | null; onSelect: (p: FoundPlace) => void }) {
  return (
    <>
      {places.map((p) => (
        <Marker key={`sug-${p.id}`} longitude={p.location.lng} latitude={p.location.lat} anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelect(p);
          }}>
          <button type="button" aria-label={p.name} title={p.name} data-testid="suggestion-marker"
            className={cn(
              "grid place-items-center rounded-full border-2 border-ink-900 bg-amber-400 text-ink-950 shadow-md transition-transform hover:scale-110",
              p.id === selectedId ? "size-8 scale-110" : "size-6",
            )}>
            <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden>
              <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
            </svg>
          </button>
        </Marker>
      ))}
    </>
  );
}

/** Yol tarifinden seçilen adımın konumu. */
export function FocusMarker({ position }: { position: LatLng | null }) {
  if (!position) return null;
  return (
    <Marker longitude={position.lng} latitude={position.lat} anchor="center">
      <span className="block size-4 rounded-full border-[3px] border-white bg-ink-900 shadow-md ring-4 ring-amber-400/60" aria-hidden />
    </Marker>
  );
}
