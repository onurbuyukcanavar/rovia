"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/lib/maps/maplibre-setup";
import { MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";
import MapView, { Marker, NavigationControl, useMap } from "react-map-gl/maplibre";
import { PlaceSearch } from "@/components/map/place-search";
import { fieldClass } from "@/components/journal/note-editor";
import { mapsApi } from "@/lib/maps/client";
import type { Stop } from "@/lib/maps/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.travelogue.pages.entry;
const TURKEY_CENTER = { lat: 39.0, lng: 35.2 };

export type EntryLocation = { locationName: string | null; address: string | null; lat: number | null; lng: number | null; osmRef: string | null };

/** Yazının konumu: yer arama, küçük haritaya dokunarak seçme, ad/adres düzenleme ya da kaldırma. */
export function LocationPicker({ initial, styleUrl, onChange }: {
  initial: EntryLocation; styleUrl: string; onChange: (loc: EntryLocation) => void;
}) {
  const [loc, setLoc] = useState<EntryLocation>(initial);
  const [moveNonce, setMoveNonce] = useState(0);
  const hasCoords = loc.lat !== null && loc.lng !== null;

  function apply(next: EntryLocation, recenter = false) {
    setLoc(next);
    onChange(next);
    if (recenter) setMoveNonce((n) => n + 1);
  }

  const stop: Stop | null = hasCoords
    ? { id: loc.osmRef ?? "current", label: loc.locationName ?? "", address: loc.address, ref: loc.osmRef, location: { lat: loc.lat!, lng: loc.lng! } }
    : null;

  async function pickOnMap(lat: number, lng: number) {
    const base: EntryLocation = { ...loc, lat, lng, osmRef: null };
    apply(base);
    try {
      const { label } = await mapsApi.reverseGeocode({ lat, lng });
      if (!label) return;
      // Kullanıcının yazdığı adı ezme; yalnızca boş alanları doldur
      setLoc((cur) => {
        if (cur.lat !== lat || cur.lng !== lng) return cur;
        const next = { ...cur, locationName: cur.locationName || label, address: cur.address || label };
        onChange(next);
        return next;
      });
    } catch {
      /* adres bulunamadı: koordinat yeterli */
    }
  }

  return (
    <div className="space-y-3" data-testid="location-picker">
      <PlaceSearch label={T.searchPlace} value={stop} marker={<MapPin className="size-4 text-amber-600" aria-hidden />}
        onSelect={(s) => {
          if (!s) return;
          apply({ locationName: s.label, address: s.address, lat: s.location.lat, lng: s.location.lng, osmRef: s.ref }, true);
        }} />

      <div className="relative h-48 overflow-hidden rounded-2xl border border-sand-200 sm:h-56" data-testid="location-map">
        <MapView
          initialViewState={hasCoords ? { longitude: loc.lng!, latitude: loc.lat!, zoom: 13 } : { longitude: TURKEY_CENTER.lng, latitude: TURKEY_CENTER.lat, zoom: 4.6 }}
          mapStyle={styleUrl} style={{ width: "100%", height: "100%" }} attributionControl={{ compact: true }} dragRotate={false}
          cursor="crosshair"
          onClick={(e) => void pickOnMap(Number(e.lngLat.lat.toFixed(6)), Number(e.lngLat.lng.toFixed(6)))}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {hasCoords && (
            <Marker longitude={loc.lng!} latitude={loc.lat!} anchor="bottom">
              <MapPin className="size-8 fill-amber-500 text-ink-900 drop-shadow" aria-hidden />
            </Marker>
          )}
          <Recenter lat={loc.lat} lng={loc.lng} nonce={moveNonce} />
        </MapView>
      </div>
      <p className="text-xs text-stone-600">{T.mapPickHint}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="entry-loc-name" className="block text-sm font-semibold text-ink-800">{T.locationName}</label>
          <input id="entry-loc-name" className={cn(fieldClass, "h-11")} value={loc.locationName ?? ""} maxLength={200}
            onChange={(e) => apply({ ...loc, locationName: e.target.value || null })} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="entry-loc-address" className="block text-sm font-semibold text-ink-800">{T.address}</label>
          <input id="entry-loc-address" className={cn(fieldClass, "h-11")} value={loc.address ?? ""} maxLength={500}
            onChange={(e) => apply({ ...loc, address: e.target.value || null })} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-stone-600 tabular-nums" data-testid="entry-coords">
          {T.coords}: {hasCoords ? `${loc.lat!.toFixed(5)}, ${loc.lng!.toFixed(5)}` : T.noLocation}
        </span>
        {(hasCoords || loc.locationName || loc.address) && (
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-stone-700 underline underline-offset-2"
            onClick={() => apply({ locationName: null, address: null, lat: null, lng: null, osmRef: null })}>
            <X className="size-4" aria-hidden /> {T.removeLocation}
          </button>
        )}
      </div>
    </div>
  );
}

function Recenter({ lat, lng, nonce }: { lat: number | null; lng: number | null; nonce: number }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!map || nonce === 0 || lat === null || lng === null) return;
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca aramadan seçimde (nonce) odaklan
  }, [map, nonce]);
  return null;
}
