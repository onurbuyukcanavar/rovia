"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo, useState } from "react";
import { Layer, Marker, NavigationControl, ScaleControl, Source, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { MapView } from "@/lib/maps/maplibre-setup";
import { Alert } from "@/components/ui/alert";
import { FitBounds, PanTo } from "@/components/map/map-layers";
import type { LatLng } from "@/lib/geo";
import type { Favorite } from "@/lib/favorites/types";
import { t } from "@/i18n";

const TURKEY_CENTER = { lat: 39.0, lng: 35.2 };
export const FAVORITE_LAYER = "favorite-points";

type Props = {
  styleUrl: string;
  places: Favorite[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Yer ekleme sırasında haritaya dokunulan nokta (geçici işaret) */
  candidate: LatLng | null;
  /** Ekleme açıkken haritaya dokunmak nokta seçer */
  picking: boolean;
  onPick: (p: LatLng) => void;
  /** Boş bir yere dokunuldu (telefonda haritayı büyütmek için) */
  onBackgroundTap?: () => void;
};

/**
 * Favori yerler haritası. Binlerce yer olabileceği için DOM işaretleri yerine tek GeoJSON katmanı
 * (daire) kullanılır: favoriler amber, "daha sonra gideceğim" lacivert.
 */
export function FavoritesMap({ styleUrl, places, selectedId, onSelect, candidate, picking, onPick, onBackgroundTap }: Props) {
  const [mapError, setMapError] = useState(false);

  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: places.map((p) => ({
        type: "Feature" as const,
        properties: { id: p.id, list: p.listType, selected: p.id === selectedId },
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      })),
    }),
    [places, selectedId],
  );

  const points = useMemo(() => places.map((p) => ({ lat: p.lat, lng: p.lng })), [places]);
  // Filtre değişince (yer kümesi değişince) kamera tümünü gösterir
  const fitKey = useMemo(() => places.map((p) => p.id).join(","), [places]);
  const selected = places.find((p) => p.id === selectedId) ?? null;
  // Yalnızca seçim/aday değişince kaydır (her render'da yeni nesne üretme)
  const focus = useMemo(
    () => candidate ?? (selected ? { lat: selected.lat, lng: selected.lng } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seçili yerin konumu id ile belirlenir
    [candidate, selected?.id],
  );

  function onClick(e: MapLayerMouseEvent) {
    if (picking) {
      onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      return;
    }
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === "string") onSelect(id);
    else onBackgroundTap?.();
  }

  return (
    <div className="relative h-full w-full" data-testid="favorites-map">
      <MapView
        initialViewState={{ longitude: TURKEY_CENTER.lng, latitude: TURKEY_CENTER.lat, zoom: 5.2 }}
        mapStyle={styleUrl}
        style={{ width: "100%", height: "100%" }}
        cursor={picking ? "crosshair" : undefined}
        interactiveLayerIds={picking ? [] : [FAVORITE_LAYER]}
        onClick={onClick}
        attributionControl={{ compact: true }}
        dragRotate={false}
        onError={(e) => {
          console.error("[rovia] harita:", e.error?.message);
          setMapError(true);
        }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />
        <Source id="favorites" type="geojson" data={data}>
          <Layer
            id={FAVORITE_LAYER}
            type="circle"
            paint={{
              // MapLibre: "zoom" yalnızca en dıştaki interpolate'te kullanılabilir; seçili durum her durakta ayrı
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, ["case", ["get", "selected"], 9, 5], 12, ["case", ["get", "selected"], 12, 8]],
              "circle-color": ["case", ["==", ["get", "list"], "want_to_go"], "#1d3557", "#e8912d"],
              "circle-stroke-color": ["case", ["get", "selected"], "#0e1726", "#ffffff"],
              "circle-stroke-width": ["case", ["get", "selected"], 3, 2],
            }}
          />
        </Source>
        {candidate && (
          <Marker longitude={candidate.lng} latitude={candidate.lat} anchor="bottom">
            <span className="block size-6 rounded-full rounded-br-none border-[3px] border-ink-900 bg-amber-500 shadow-md [transform:rotate(45deg)]"
              title={t.favorites.pickedPoint} data-testid="candidate-marker" />
          </Marker>
        )}
        <FitBounds points={points} deps={fitKey} />
        <PanTo position={focus} />
      </MapView>
      {mapError && (
        <div className="absolute inset-x-3 top-14 z-10">
          <Alert tone="error">{t.maps.loadError}</Alert>
        </div>
      )}
    </div>
  );
}
