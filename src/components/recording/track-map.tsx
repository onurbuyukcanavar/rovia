"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import { Camera, NotebookPen } from "lucide-react";
import { Layer, Marker, NavigationControl, ScaleControl, Source } from "react-map-gl/maplibre";
import { MapView } from "@/lib/maps/maplibre-setup";
import { Alert } from "@/components/ui/alert";
import { FitBounds, MyLocationMarker, PanTo, StopPin } from "@/components/map/map-layers";
import { decodePolyline, type LatLng } from "@/lib/geo";
import { t } from "@/i18n";

const TURKEY_CENTER = { lat: 39.0, lng: 35.2 };

/** Haritadaki günlük işaretleri: fotoğrafın çekildiği yer ya da notun yeri */
export type MapPin = { id: string; lat: number; lng: number; kind: "photo" | "note"; label: string };

type Props = {
  styleUrl: string;
  /** Kaydedilen iz, bölüm bölüm */
  paths: LatLng[][];
  /** Canlı kayıtta mevcut konum (kamera takip eder) */
  position?: LatLng | null;
  /** Planlı yolculuğun rotası (kesik çizgi) */
  plannedPolyline?: string | null;
  /** Özet ekranı: başlangıç/bitiş işaretleri ve tüm izi gösteren kamera */
  showEndpoints?: boolean;
  pins?: MapPin[];
  className?: string;
};

/** GPS izi haritası (MapLibre + OpenFreeMap). */
export function TrackMap({ styleUrl, paths, position = null, plannedPolyline = null, showEndpoints = false, pins = [], className }: Props) {
  const [mapError, setMapError] = useState(false);

  const track = useMemo(
    () => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "MultiLineString" as const,
        coordinates: paths.filter((p) => p.length > 1).map((p) => p.map((x) => [x.lng, x.lat])),
      },
    }),
    [paths],
  );
  const planned = useMemo(() => {
    if (!plannedPolyline) return null;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates: decodePolyline(plannedPolyline).map((p) => [p.lng, p.lat]) },
    };
  }, [plannedPolyline]);

  const all = useMemo(() => paths.flat(), [paths]);
  const start = all[0] ?? null;
  const end = all.length > 1 ? all[all.length - 1] : null;
  // Canlı kayıtta kamera konumu takip eder; özette tüm iz (yoksa planlanan rota) görünür
  const fitPoints = useMemo(
    () => (showEndpoints ? (all.length ? all : planned ? decodePolyline(plannedPolyline!) : []) : planned && !position ? decodePolyline(plannedPolyline!) : []),
    [showEndpoints, all, planned, plannedPolyline, position],
  );

  return (
    <div className={className} data-testid="track-map">
      <MapView
        initialViewState={
          position
            ? { longitude: position.lng, latitude: position.lat, zoom: 15 }
            : { longitude: TURKEY_CENTER.lng, latitude: TURKEY_CENTER.lat, zoom: 5.2 }
        }
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
        {planned && (
          <Source id="planned" type="geojson" data={planned}>
            <Layer id="planned-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#7b879b", "line-width": 4, "line-dasharray": [1.5, 1.5], "line-opacity": 0.8 }} />
          </Source>
        )}
        <Source id="track" type="geojson" data={track}>
          <Layer id="track-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": "#0e1726", "line-width": 8 }} />
          <Layer id="track-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{ "line-color": "#e8912d", "line-width": 4 }} />
        </Source>
        {showEndpoints && start && (
          <Marker longitude={start.lng} latitude={start.lat} anchor="center">
            <span title={t.tripSummary.start}><StopPin label="A" tone="origin" /></span>
          </Marker>
        )}
        {showEndpoints && end && (
          <Marker longitude={end.lng} latitude={end.lat} anchor="center">
            <span title={t.tripSummary.end}><StopPin label="B" tone="destination" /></span>
          </Marker>
        )}
        {pins.map((p) => (
          <Marker key={p.id} longitude={p.lng} latitude={p.lat} anchor="center">
            <span title={p.label} aria-label={p.label} data-testid={`pin-${p.kind}`}
              className={p.kind === "photo"
                ? "grid size-6 place-items-center rounded-full border-2 border-white bg-amber-500 text-ink-950 shadow-md"
                : "grid size-6 place-items-center rounded-full border-2 border-white bg-ink-900 text-paper shadow-md"}>
              {p.kind === "photo" ? <Camera className="size-3.5" aria-hidden /> : <NotebookPen className="size-3.5" aria-hidden />}
            </span>
          </Marker>
        ))}
        <MyLocationMarker position={position} />
        <FitBounds points={fitPoints} deps={showEndpoints ? all.length : plannedPolyline} />
        {!showEndpoints && <PanTo position={position} />}
      </MapView>
      {mapError && (
        <div className="absolute inset-x-3 top-3 z-10">
          <Alert tone="error">{t.maps.loadError}</Alert>
        </div>
      )}
    </div>
  );
}
