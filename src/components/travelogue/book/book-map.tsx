"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import { MapView } from "@/lib/maps/maplibre-setup";
import { boundsOf, type LatLng } from "@/lib/geo";
import type { BookMarker } from "@/lib/travelogue/pdf/model";
import { t } from "@/i18n";
import { ThemedMapStyle } from "@/components/theme/themed-map-style";

/** Rota boyası haritanın temasına göre (aydınlıkta önceki görünüm; koyuda açık kenar + amber çizgi). */
const ROUTE = { light: { casing: "#ffffff", line: "#0e1726" }, dark: { casing: "#f7f5f0", line: "#e8912d" } } as const;

/** Kitaptaki rota haritası: sabit görünüm (sürükleme/yakınlaştırma yok), rota ve numaralı duraklar. */
export function BookMap({ styleUrl, paths, markers }: { styleUrl: string; paths: LatLng[][]; markers: BookMarker[] }) {
  const [failed, setFailed] = useState(false);
  const route = useMemo(
    () => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "MultiLineString" as const, coordinates: paths.map((p) => p.map((x) => [x.lng, x.lat])) },
    }),
    [paths],
  );
  const initialViewState = useMemo(() => {
    const pts = [...paths.flat(), ...markers.map((m) => ({ lat: m.lat, lng: m.lng }))];
    const b = boundsOf(pts);
    if (!b || pts.length === 1 || (b.west === b.east && b.south === b.north)) return { longitude: pts[0]?.lng ?? 35.2, latitude: pts[0]?.lat ?? 39, zoom: 11 };
    return { bounds: [[b.west, b.south], [b.east, b.north]] as [[number, number], [number, number]], fitBoundsOptions: { padding: 48, maxZoom: 14 } };
  }, [paths, markers]);

  if (failed) return <p className="rounded-xl border border-line bg-sunken p-6 text-center font-sans text-sm text-fg-muted">{t.travelogue.book.mapUnavailable}</p>;
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-line bg-sunken" data-testid="book-map">
      <ThemedMapStyle styleUrl={styleUrl}>{(mapStyle, theme) => (
        <MapView
          initialViewState={initialViewState}
          mapStyle={mapStyle}
          style={{ width: "100%", height: "100%" }}
          interactive={false}
          attributionControl={{ compact: true }}
          onError={(e) => {
            console.error("[rovia] kitap haritası:", e.error?.message);
            setFailed(true);
          }}
        >
          {paths.length > 0 && (
            <Source id="book-route" type="geojson" data={route}>
              <Layer id="book-route-casing" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": ROUTE[theme].casing, "line-width": 7 }} />
              <Layer id="book-route-line" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": ROUTE[theme].line, "line-width": 4 }} />
            </Source>
          )}
          {markers.map((m) => (
            <Marker key={m.number} longitude={m.lng} latitude={m.lat} anchor="center">
              <a
                href={`#${m.anchor}`}
                className="grid size-6 place-items-center rounded-full border-2 border-fg bg-accent font-sans text-[0.7rem] font-bold text-accent-fg shadow-[var(--shadow-overlay)]"
                title={m.title}
              >
                {m.number}
              </a>
            </Marker>
          ))}
        </MapView>
      )}</ThemedMapStyle>
    </div>
  );
}
