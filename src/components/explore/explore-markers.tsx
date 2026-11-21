"use client";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { useMemo } from "react";
import { decodePolyline } from "@/lib/geo";
import type { ExplorePlace } from "@/lib/explore/types";
import { cn } from "@/lib/cn";
import type { ResolvedTheme } from "@/lib/theme/theme";

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
              style={active ? undefined : { backgroundColor: color }}
              className={cn(
                "grid place-items-center rounded-full border-2 border-white font-extrabold tabular-nums shadow-md transition-transform hover:scale-110",
                // Seçili işaret temanın ön plan rengiyle dolu: koyu haritada açık, aydınlıkta mürekkep
                active ? "size-8 scale-110 bg-fg text-xs text-surface ring-4 ring-accent/70" : "size-6 text-[0.62rem] text-white",
              )}>
              {i + 1}
            </button>
          </Marker>
        );
      })}
    </>
  );
}

/** Rota kenarı temaya göre: koyu haritada mürekkep kenar görünmez, açık kenar kullanılır. */
const CASING = { dark: "#f7f5f0", light: "#0e1726" } as const;

/** Seçili yolculuğun rotası (amber çizgi). */
export function TripLine({ polyline, theme = "light" }: { polyline: string; theme?: ResolvedTheme }) {
  const data = useMemo(() => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: decodePolyline(polyline).map((p) => [p.lng, p.lat]) },
  }), [polyline]);
  return (
    <Source id="explore-trip" type="geojson" data={data}>
      <Layer id="explore-trip-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": CASING[theme], "line-width": 7, "line-opacity": theme === "dark" ? 0.55 : 0.8 }} />
      <Layer id="explore-trip-main" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": "#e8912d", "line-width": 3.5 }} />
    </Source>
  );
}
