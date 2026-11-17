"use client";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { useMemo } from "react";
import { decodePolyline } from "@/lib/geo";
import type { ExplorePlace } from "@/lib/explore/types";
import { cn } from "@/lib/cn";

/** Numaralı, kategori renginde işaretler (en fazla 300; liste sırasıyla aynı numara). */
export function ExploreMarkers({ places, color, selectedId, onSelect }: {
  places: ExplorePlace[]; color: string; selectedId: string | null; onSelect: (p: ExplorePlace) => void;
}) {
  return (
    <>
      {places.map((p, i) => {
        const active = p.id === selectedId;
        return (
          <Marker key={p.id} longitude={p.location.lng} latitude={p.location.lat} anchor="center"
            style={{ zIndex: active ? 10 : undefined }}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(p);
            }}>
            <button type="button" aria-label={`${i + 1}. ${p.name}`} title={p.name} data-testid="explore-marker"
              style={{ backgroundColor: active ? "#0e1726" : color }}
              className={cn(
                "grid place-items-center rounded-full border-2 border-white font-extrabold text-white tabular-nums shadow-md transition-transform hover:scale-110",
                active ? "size-8 scale-110 text-xs ring-4 ring-amber-400/70" : "size-6 text-[0.62rem]",
              )}>
              {i + 1}
            </button>
          </Marker>
        );
      })}
    </>
  );
}

/** Seçili yolculuğun rotası (amber çizgi). */
export function TripLine({ polyline }: { polyline: string }) {
  const data = useMemo(() => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: decodePolyline(polyline).map((p) => [p.lng, p.lat]) },
  }), [polyline]);
  return (
    <Source id="explore-trip" type="geojson" data={data}>
      <Layer id="explore-trip-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#0e1726", "line-width": 7, "line-opacity": 0.8 }} />
      <Layer id="explore-trip-main" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#e8912d", "line-width": 3.5 }} />
    </Source>
  );
}
