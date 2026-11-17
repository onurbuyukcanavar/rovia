"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maps/maplibre-setup";
import { useMemo, useState } from "react";
import MapView, { Layer, Marker, Source } from "react-map-gl/maplibre";
import { boundsOf, type LatLng } from "@/lib/geo";
import type { BookMarker } from "@/lib/travelogue/pdf/model";
import { t } from "@/i18n";

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

  if (failed) return <p className="rounded-lg bg-sand-100 p-6 text-center text-sm text-stone-600">{t.travelogue.book.mapUnavailable}</p>;
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-sand-200 bg-sand-100" data-testid="book-map">
      <MapView
        initialViewState={initialViewState}
        mapStyle={styleUrl}
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
            <Layer id="book-route-casing" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": "#ffffff", "line-width": 7 }} />
            <Layer id="book-route-line" type="line" layout={{ "line-join": "round", "line-cap": "round" }} paint={{ "line-color": "#0e1726", "line-width": 4 }} />
          </Source>
        )}
        {markers.map((m) => (
          <Marker key={m.number} longitude={m.lng} latitude={m.lat} anchor="center">
            <a
              href={`#${m.anchor}`}
              className="grid size-6 place-items-center rounded-full border-2 border-ink-900 bg-amber-500 font-sans text-[0.7rem] font-bold text-ink-950 shadow"
              title={m.title}
            >
              {m.number}
            </a>
          </Marker>
        ))}
      </MapView>
    </div>
  );
}
