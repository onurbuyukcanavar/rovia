"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { Check, Copy, ExternalLink, LoaderCircle, Map as MapIcon, MapPin, Navigation } from "lucide-react";
import { useMemo, useState } from "react";
import { Marker, NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import { MapView } from "@/lib/maps/maplibre-setup";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { placeToSearchParams } from "@/lib/explore/place-param";
import { formatCoords, googleMapsUrl, parseSharedLocation } from "@/lib/shared-location/parse";
import { resolveLocation } from "@/lib/shared-location/client";
import type { ResolvedLocation } from "@/lib/shared-location/types";
import type { FoundPlace } from "@/lib/maps/types";
import type { ListType } from "@/lib/favorites/types";
import { FavoriteActions } from "@/components/favorites/favorite-actions";
import { MapFrame, useMapExpand } from "@/components/map/map-frame";
import { PanelHeading } from "@/components/map/road-motif";
import { StopPin } from "@/components/map/map-layers";
import { ThemedMapStyle } from "@/components/theme/themed-map-style";
import { PageHeader } from "@/components/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { PasteBox } from "./paste-box";
import { t } from "@/i18n";

type Props = {
  styleUrl: string;
  /** Ayrıştırılacak metin (WhatsApp mesajı, bağlantı, geo: URI, koordinat); boşsa yalnızca yapıştırma kutusu */
  input: string;
  /** Paylaşım başlığı / label parametresi: bağlantıda ad yoksa kullanılır */
  labelHint: string | null;
};

/**
 * Paylaşılan konum: ayrıştır (tarayıcıda, anında) → sunucuda çöz (kısa bağlantı, yer adı, ters adres araması) →
 * harita + ad + koordinat + eylemler. Koordinat doğrudan okunabiliyorsa sunucu yanıtı beklenmeden gösterilir.
 */
export function SharedLocationView({ styleUrl, input, labelHint }: Props) {
  const parsed = useMemo(() => parseSharedLocation(input, { allowQuery: true }), [input]);
  const resolved = useKeyedRequest<ResolvedLocation>(parsed ? `${input}\u0000${labelHint ?? ""}` : null, (signal) => resolveLocation(input, labelHint, signal));

  const immediate: ResolvedLocation | null = parsed?.kind === "point"
    ? { lat: parsed.lat, lng: parsed.lng, label: parsed.label ?? labelHint, address: null, source: parsed.source, approximate: parsed.approximate }
    : null;
  const location = resolved.data ?? immediate;

  if (!input.trim() || (!location && (!parsed || resolved.error))) {
    const error = !input.trim() ? null : !parsed ? t.sharedLocation.errors.notFound : resolved.error;
    return (
      <div data-themed className="mx-auto max-w-xl space-y-6 px-4 py-6 lg:py-10">
        <PageHeader eyebrow={t.sharedLocation.eyebrow} title={t.sharedLocation.title} description={t.sharedLocation.description} />
        {error && <Alert tone="error">{error}</Alert>}
        <PasteBox initial={error ? input : ""} autoFocus={!input.trim()} />
      </div>
    );
  }

  return <LocationDetail styleUrl={styleUrl} location={location} loading={resolved.loading} />;
}

function LocationDetail({ styleUrl, location, loading }: { styleUrl: string; location: ResolvedLocation | null; loading: boolean }) {
  const mapView = useMapExpand();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<ListType | null>(null);
  const [mapError, setMapError] = useState(false);

  const name = location ? (location.label ?? location.address ?? t.sharedLocation.unnamed) : t.sharedLocation.resolving;
  const address = location?.label ? location.address : null;
  const place = useMemo<FoundPlace | null>(() => location && ({
    id: `p${location.lat.toFixed(5)},${location.lng.toFixed(5)}`,
    name: (location.label ?? location.address ?? t.sharedLocation.unnamed).slice(0, 200),
    address: location.label ? location.address : null,
    location: { lat: location.lat, lng: location.lng },
    category: "", typeLabel: null, tags: {}, distanceFromRoute: 0, alongRoute: null,
  }), [location]);
  const params = (from: boolean) => place
    ? placeToSearchParams({ ref: null, name: place.name, lat: place.location.lat, lng: place.location.lng, address: place.address }, { fromCurrentLocation: from })
    : "";

  async function copy() {
    if (!location) return;
    try {
      await navigator.clipboard.writeText(formatCoords(location));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano izni yoksa metin seçilebilir durumda kalır
    }
  }

  return (
    <div data-themed className="relative flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr] lg:overflow-hidden">
      <MapFrame expanded={mapView.expanded} onExpand={mapView.expand} onCollapse={mapView.collapse}
        className="order-1 h-[42%] shrink-0 lg:order-2 lg:h-full" testId="shared-location-map">
        {location ? (
          <ThemedMapStyle styleUrl={styleUrl}>{(mapStyle) => (
            <MapView
              key={`${location.lat},${location.lng}`}
              initialViewState={{ longitude: location.lng, latitude: location.lat, zoom: location.approximate ? 13 : 15 }}
              mapStyle={mapStyle}
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
              <Marker longitude={location.lng} latitude={location.lat} anchor="center">
                <span title={name} data-testid="shared-location-pin"><StopPin label="" tone="destination" /></span>
              </Marker>
            </MapView>
          )}</ThemedMapStyle>
        ) : (
          <div className="grid h-full place-items-center bg-sunken" aria-busy="true">
            <LoaderCircle className="size-6 animate-spin text-fg-subtle" aria-label={t.common.loading} />
          </div>
        )}
        {mapError && (
          <div className="absolute inset-x-3 top-14 z-10 rounded-xl bg-overlay shadow-[var(--shadow-overlay)]">
            <Alert tone="error">{t.maps.loadError}</Alert>
          </div>
        )}
      </MapFrame>

      <aside className="order-2 min-h-0 flex-1 overflow-y-auto border-t border-line bg-surface px-4 py-5 lg:order-1 lg:border-t-0 lg:border-r lg:px-6 lg:py-8">
        <div className="space-y-6">
          <div className="space-y-3">
            <PanelHeading eyebrow={t.sharedLocation.title} title={name} description={address ?? undefined} />
            {location && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">{t.sharedLocation.sourceLabel(t.sharedLocation.sources[location.source] ?? location.source)}</Badge>
                {loading && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> {t.sharedLocation.resolving}
                  </span>
                )}
              </div>
            )}
            {location?.approximate && <Alert>{t.sharedLocation.approximate}</Alert>}
          </div>

          {location && place && (
            <>
              <div className="card flex items-center gap-3 px-4 py-3">
                <MapPin className="size-4 shrink-0 text-accent-ink" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-fg-subtle">{t.sharedLocation.coordinates}</p>
                  <p className="truncate font-mono text-sm text-fg tabular-nums select-all" data-testid="shared-location-coords">{formatCoords(location)}</p>
                </div>
                <button type="button" onClick={copy} aria-label={t.sharedLocation.copy} title={t.sharedLocation.copy}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-fg-muted transition hover:bg-fg/[0.07] hover:text-fg">
                  {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                </button>
                <span className="sr-only" role="status">{copied ? t.sharedLocation.copied : ""}</span>
              </div>

              <div className="grid gap-2">
                <ButtonLink href={`/planla?${params(true)}`} variant="accent" className="w-full" data-testid="shared-location-route">
                  <Navigation className="size-4" aria-hidden /> {t.sharedLocation.actions.route}
                </ButtonLink>
                <ButtonLink href={`/harita?${params(false)}`} variant="secondary" className="w-full">
                  <MapIcon className="size-4" aria-hidden /> {t.sharedLocation.actions.map}
                </ButtonLink>
              </div>

              <FavoriteActions place={place} saved={saved} onSaved={setSaved} primary="secondary" />

              <a href={googleMapsUrl(location)} target="_blank" rel="noopener noreferrer"
                className={buttonClass("ghost", "sm", "w-full text-fg-muted")}>
                <ExternalLink className="size-4" aria-hidden /> {t.sharedLocation.actions.google}
              </a>
            </>
          )}

          <PasteBox />
        </div>
      </aside>
    </div>
  );
}
