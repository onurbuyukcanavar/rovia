"use client";
import { AdvancedMarker, Polyline, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";
import { boundsOf, decodePolyline, type LatLng } from "@/lib/geo";
import type { FoundPlace, RouteOption, Stop } from "@/lib/maps/types";
import { cn } from "@/lib/cn";

/** Rotalar: seçili rota lacivert kontur + amber dolgu; alternatifler gri ve tıklanabilir. */
export function RouteLines({ routes, selected, onSelect }: { routes: RouteOption[]; selected: number; onSelect: (i: number) => void }) {
  const paths = useMemo(() => routes.map((r) => decodePolyline(r.encodedPolyline)), [routes]);
  return (
    <>
      {paths.map((path, i) =>
        i === selected ? null : (
          <Polyline key={`alt-${i}`} path={path} strokeColor="#7b879b" strokeOpacity={0.85} strokeWeight={5} zIndex={1}
            clickable onClick={() => onSelect(i)} />
        ),
      )}
      {paths[selected] && (
        <>
          <Polyline key={`sel-o-${selected}`} path={paths[selected]} strokeColor="#0e1726" strokeOpacity={1} strokeWeight={8} zIndex={2} />
          <Polyline key={`sel-i-${selected}`} path={paths[selected]} strokeColor="#e8912d" strokeOpacity={1} strokeWeight={4} zIndex={3} />
        </>
      )}
    </>
  );
}

function StopPin({ label, tone }: { label: string; tone: "origin" | "waypoint" | "destination" }) {
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
      {origin && (
        <AdvancedMarker position={origin.location} title={origin.label} zIndex={30}>
          <StopPin label="A" tone="origin" />
        </AdvancedMarker>
      )}
      {waypoints.map((w, i) =>
        w ? (
          <AdvancedMarker key={`${w.id}-${i}`} position={w.location} title={w.label} zIndex={29}>
            <StopPin label={String(i + 1)} tone="waypoint" />
          </AdvancedMarker>
        ) : null,
      )}
      {destination && (
        <AdvancedMarker position={destination.location} title={destination.label} zIndex={30}>
          <StopPin label="B" tone="destination" />
        </AdvancedMarker>
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
          <AdvancedMarker key={p.id} position={p.location} title={p.name} zIndex={active ? 40 : 20} onClick={() => onSelect(p)}>
            <span
              className={cn(
                "block rounded-full border-2 shadow transition-transform",
                active ? "size-5 scale-110 border-ink-900 bg-amber-500" : "size-3.5 border-ink-900 bg-white",
              )}
            />
          </AdvancedMarker>
        );
      })}
    </>
  );
}

export function MyLocationMarker({ position }: { position: LatLng | null }) {
  if (!position) return null;
  return (
    <AdvancedMarker position={position} title="Konumum" zIndex={50}>
      <span className="relative block size-4">
        <span className="absolute inset-0 animate-ping rounded-full bg-sky-500/40" />
        <span className="absolute inset-0 rounded-full border-2 border-white bg-sky-600 shadow" />
      </span>
    </AdvancedMarker>
  );
}

/** Rota veya duraklar değişince kamerayı hepsini gösterecek şekilde ayarlar. */
export function FitBounds({ points, padding = 64, deps }: { points: LatLng[]; padding?: number; deps: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.panTo(points[0]);
      if ((map.getZoom() ?? 0) < 11) map.setZoom(12);
      return;
    }
    const b = boundsOf(points);
    if (b) map.fitBounds(b, padding);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca anlamlı değişikliklerde (deps) odaklan
  }, [map, deps]);
  return null;
}

export function PanTo({ position }: { position: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && position) map.panTo(position);
  }, [map, position]);
  return null;
}
