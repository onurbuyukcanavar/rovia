"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maps/maplibre-setup";
import { useEffect, useMemo, useState } from "react";
import MapView, { Layer, Marker, NavigationControl, ScaleControl, Source, useMap } from "react-map-gl/maplibre";
import { Alert } from "@/components/ui/alert";
import { FitBounds } from "@/components/map/map-layers";
import { decodeTrack } from "@/lib/gps/track";
import type { LatLng } from "@/lib/geo";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const TURKEY_CENTER = { lat: 39.0, lng: 35.2 };

export type EntryPoint = { id: string; n: number; lat: number; lng: number; label: string };
export type MapFocus = { id: string; nonce: number } | null;

/** Seyahatname haritası: yolculuğun rotası + numaralı yazı işaretleri (liste ile karşılıklı bağlı). */
export function TravelogueMap({ styleUrl, polyline, points, focus, highlightedId, onSelect, className }: {
  styleUrl: string; polyline: string | null; points: EntryPoint[]; focus: MapFocus; highlightedId: string | null;
  onSelect: (id: string) => void; className?: string;
}) {
  const [mapError, setMapError] = useState(false);
  const paths = useMemo(() => decodeTrack(polyline), [polyline]);
  const track = useMemo(() => ({
    type: "Feature" as const, properties: {},
    geometry: { type: "MultiLineString" as const, coordinates: paths.filter((p) => p.length > 1).map((p) => p.map((x) => [x.lng, x.lat])) },
  }), [paths]);
  const fitPoints = useMemo<LatLng[]>(() => [...paths.flat(), ...points.map((p) => ({ lat: p.lat, lng: p.lng }))], [paths, points]);
  const focused = focus ? points.find((p) => p.id === focus.id) ?? null : null;

  return (
    <div className={cn("relative", className)} data-testid="travelogue-map">
      <MapView
        initialViewState={{ longitude: TURKEY_CENTER.lng, latitude: TURKEY_CENTER.lat, zoom: 5.2 }}
        mapStyle={styleUrl}
        style={{ width: "100%", height: "100%" }}
        attributionControl={{ compact: true }}
        dragRotate={false}
        onError={(e) => {
          console.error("[rovia] harita:", e.error?.message);
          setMapError(true);
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />
        <Source id="tl-track" type="geojson" data={track}>
          <Layer id="tl-track-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#0e1726", "line-width": 7 }} />
          <Layer id="tl-track-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": "#e8912d", "line-width": 3.5 }} />
        </Source>
        {points.map((p) => {
          const active = p.id === highlightedId || p.id === focus?.id;
          return (
            <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center" style={{ zIndex: active ? 2 : 1 }}>
              <button type="button" onClick={() => onSelect(p.id)} title={p.label} aria-label={`${p.n}. ${p.label}`}
                data-testid="entry-marker"
                className={cn(
                  "grid size-8 place-items-center rounded-full border-[3px] text-xs font-extrabold shadow-md transition",
                  active ? "scale-125 border-ink-900 bg-amber-500 text-ink-950" : "border-paper bg-ink-900 text-paper hover:bg-ink-700",
                )}>
                {p.n}
              </button>
            </Marker>
          );
        })}
        <FitBounds points={fitPoints} deps={`${polyline?.length ?? 0}:${points.length}`} />
        <FlyTo point={focused} nonce={focus?.nonce ?? 0} />
      </MapView>
      {mapError && (
        <div className="absolute inset-x-3 top-3 z-10"><Alert tone="error">{t.maps.loadError}</Alert></div>
      )}
    </div>
  );
}

function FlyTo({ point, nonce }: { point: LatLng | null; nonce: number }) {
  const { current: map } = useMap();
  const lat = point?.lat;
  const lng = point?.lng;
  useEffect(() => {
    if (!map || lat === undefined || lng === undefined) return;
    map.resize();
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), duration: 700 });
  }, [map, lat, lng, nonce]);
  return null;
}
