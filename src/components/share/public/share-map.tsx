"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import { Layer, Marker, NavigationControl, Source } from "react-map-gl/maplibre";
import { MapView } from "@/lib/maps/maplibre-setup";
import { boundsOf, type LatLng } from "@/lib/geo";
import { t } from "@/i18n";
import { ThemedMapStyle } from "@/components/theme/themed-map-style";

/** Rota boyası haritanın temasına göre (aydınlıkta önceki görünüm; koyuda açık kenar + amber çizgi). */
const ROUTE = { light: { casing: "#ffffff", line: "#0e1726" }, dark: { casing: "#f7f5f0", line: "#e8912d" } } as const;

type Pin = { lat: number; lng: number; label: string; kind: string };

/** Paylaşım sayfasındaki rota haritası: rotaya sığdırılmış görünüm, duraklar numaralı işaretlerle. */
export function ShareMap({ styleUrl, paths, pins }: { styleUrl: string; paths: LatLng[][]; pins: Pin[] }) {
  const [failed, setFailed] = useState(false);
  const route = useMemo(() => ({
    type: "Feature" as const,
    properties: {},
    geometry: { type: "MultiLineString" as const, coordinates: paths.map((p) => p.map((x) => [x.lng, x.lat])) },
  }), [paths]);
  const initialViewState = useMemo(() => {
    const pts = [...paths.flat(), ...pins];
    const b = boundsOf(pts);
    if (!b || pts.length === 1 || (b.west === b.east && b.south === b.north)) return { longitude: pts[0]?.lng ?? 35.2, latitude: pts[0]?.lat ?? 39, zoom: pts.length ? 11 : 5 };
    return { bounds: [[b.west, b.south], [b.east, b.north]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 48, maxZoom: 14 } };
  }, [paths, pins]);

  if (failed) return <p className="grid h-full place-items-center bg-sunken p-6 text-center text-sm text-fg-muted">{t.share.page.mapUnavailable}</p>;
  return (
    <ThemedMapStyle styleUrl={styleUrl}>{(mapStyle, theme) => (
      <MapView
        initialViewState={initialViewState}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
        dragRotate={false}
        cooperativeGestures
        attributionControl={{ compact: true }}
        onError={(e) => {
          console.error("[rovia] paylaşım haritası:", e.error?.message);
          setFailed(true);
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {paths.length > 0 && (
          <Source id="share-route" type="geojson" data={route}>
            <Layer id="share-route-casing" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": ROUTE[theme].casing, "line-width": 8 }} />
            <Layer id="share-route-line" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": ROUTE[theme].line, "line-width": 4.5 }} />
          </Source>
        )}
        {pins.map((p, i) => (
          <Marker key={`${i}-${p.lat}-${p.lng}`} longitude={p.lng} latitude={p.lat} anchor="center">
            <span title={p.label}
              className={p.kind === "destination"
                ? "grid size-7 place-items-center rounded-full border-2 border-surface bg-accent font-sans text-xs font-bold text-accent-fg shadow-[var(--shadow-overlay)]"
                : "grid size-6 place-items-center rounded-full border-2 border-fg bg-surface font-sans text-[0.7rem] font-bold text-fg shadow-[var(--shadow-overlay)]"}>
              {i + 1}
            </span>
          </Marker>
        ))}
      </MapView>
    )}</ThemedMapStyle>
  );
}
