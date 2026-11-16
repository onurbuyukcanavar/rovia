"use client";
import { APIProvider, Map, useApiLoadingStatus, APILoadingStatus, type MapMouseEvent } from "@vis.gl/react-google-maps";
import { useCallback, useMemo, useReducer, useState } from "react";
import { decodePolyline, type LatLng } from "@/lib/geo";
import { mapsApi } from "@/lib/maps/client";
import {
  explorerReducer, initialExplorerState, newKey, routeRequest, routeRequestKey, type SlotRef,
} from "@/lib/maps/explorer-state";
import type { FoundPlace, RouteResult, Stop } from "@/lib/maps/types";
import { useGeolocation } from "@/lib/maps/use-geolocation";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { Alert } from "@/components/ui/alert";
import { DiscoverPanel } from "./discover-panel";
import { FitBounds, MyLocationMarker, PanTo, ResultMarkers, RouteLines, StopMarkers } from "./map-layers";
import { PlaceDetail } from "./place-detail";
import { RouteBuilder } from "./route-builder";
import { RouteSummary } from "./route-summary";
import { t } from "@/i18n";

const TURKEY_CENTER = { lat: 39.0, lng: 35.2 };

export function MapExplorer({ apiKey, mapId }: { apiKey: string; mapId: string }) {
  return (
    <APIProvider apiKey={apiKey} language="tr" region="TR">
      <Explorer mapId={mapId} />
    </APIProvider>
  );
}

function MapLoadError() {
  const status = useApiLoadingStatus();
  if (status !== APILoadingStatus.FAILED && status !== APILoadingStatus.AUTH_FAILURE) return null;
  return (
    <div className="absolute inset-x-3 top-3 z-10">
      <Alert tone="error">{t.maps.loadError}</Alert>
    </div>
  );
}

function Explorer({ mapId }: { mapId: string }) {
  const [state, dispatch] = useReducer(explorerReducer, undefined, initialExplorerState);
  const [picking, setPicking] = useState<SlotRef | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng>(TURKEY_CENTER);
  const [category, setCategory] = useState<string | null>(null);
  const [radius, setRadius] = useState(5_000);
  const [selectedPlace, setSelectedPlace] = useState<FoundPlace | null>(null);
  const geo = useGeolocation();

  // ---------------------------------------------------------------- Rota hesaplama
  // reqKey isteğin tüm girdilerini (duraklar + trafik tercihi) kapsar; aynı anahtar için tekrar istek atılmaz
  const reqKey = routeRequestKey(state);
  const route = useKeyedRequest<RouteResult>(
    reqKey,
    (signal) => mapsApi.route(routeRequest(state)!, { alternatives: true, trafficAware: state.trafficAware }, signal),
    { delayMs: 500, keepPrevious: true },
  );
  const routeResult = route.data ?? null;
  const selectedRoute = routeResult?.routes[state.selectedRoute] ?? routeResult?.routes[0] ?? null;
  const polyline = !route.error ? (selectedRoute?.encodedPolyline ?? null) : null;

  // ---------------------------------------------------------------- Kategori araması
  // Rota varsa rota boyunca; yoksa kategori seçildiği andaki harita merkezi çevresinde
  const [searchCenter, setSearchCenter] = useState<LatLng>(TURKEY_CENTER);
  const searchKey = category
    ? polyline
      ? `route|${category}|${radius}|${polyline.length}:${polyline.slice(0, 24)}:${polyline.slice(-24)}`
      : `near|${category}|${radius}|${searchCenter.lat.toFixed(3)},${searchCenter.lng.toFixed(3)}`
    : null;
  const search = useKeyedRequest<FoundPlace[]>(
    searchKey,
    (signal) =>
      polyline
        ? mapsApi.searchAlongRoute(category!, polyline, radius, signal)
        : mapsApi.searchNearby(category!, searchCenter, radius, signal),
    { delayMs: 300 },
  );
  const results = search.data ?? null;
  const chooseCategory = (key: string | null) => {
    setSearchCenter(mapCenter);
    setCategory(key);
  };

  // ---------------------------------------------------------------- Haritadan seçim / konum
  const stopFromPoint = useCallback(async (point: LatLng, fallbackLabel: string): Promise<Stop> => {
    try {
      const g = await mapsApi.reverseGeocode(point);
      return { id: newKey(), label: g.label, address: g.address, placeId: null, location: point };
    } catch {
      return { id: newKey(), label: fallbackLabel, address: null, placeId: null, location: point };
    }
  }, []);

  const onMapClick = useCallback(
    async (e: MapMouseEvent) => {
      if (!picking || !e.detail.latLng) return;
      const slot = picking;
      setPicking(null);
      const point = e.detail.latLng;
      const stop = await stopFromPoint(point, `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
      dispatch({ type: "set", slot, stop });
    },
    [picking, stopFromPoint],
  );

  const onLocate = useCallback(async () => {
    const pos = await geo.locate();
    if (!pos) return;
    const stop = await stopFromPoint(pos, t.maps.myLocation);
    dispatch({ type: "set", slot: { kind: "origin" }, stop: { ...stop, label: `${t.maps.myLocation} · ${stop.label}` } });
  }, [geo, stopFromPoint]);

  // ---------------------------------------------------------------- Görünüm
  const stopPoints = useMemo(
    () => [state.origin.stop, ...state.waypoints.map((w) => w.stop), state.destination.stop].filter((s): s is Stop => !!s).map((s) => s.location),
    [state],
  );
  const fitPoints = useMemo(() => (selectedRoute ? decodePolyline(selectedRoute.encodedPolyline) : stopPoints), [selectedRoute, stopPoints]);
  const fitKey = selectedRoute ? `r:${reqKey}:${state.selectedRoute}` : `s:${stopPoints.map((p) => `${p.lat},${p.lng}`).join(";")}`;

  const routeContext = useMemo(() => {
    const req = routeRequest(state);
    if (!selectedRoute || !req) return null;
    return { route: selectedRoute, origin: req.origin, destination: req.destination, waypoints: req.waypoints, trafficAware: state.trafficAware };
  }, [selectedRoute, state]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.5rem-env(safe-area-inset-bottom))] flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]">
      <div className="relative order-1 h-[42%] shrink-0 lg:order-2 lg:h-full" data-testid="map">
        <Map
          mapId={mapId}
          defaultCenter={TURKEY_CENTER}
          defaultZoom={6}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          clickableIcons={false}
          draggableCursor={picking ? "crosshair" : undefined}
          onClick={onMapClick}
          onIdle={(e) => {
            const c = e.map.getCenter();
            if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
          }}
          className="size-full"
        >
          {routeResult && !route.error && <RouteLines routes={routeResult.routes} selected={state.selectedRoute} onSelect={(i) => dispatch({ type: "selectRoute", index: i })} />}
          <StopMarkers origin={state.origin.stop} waypoints={state.waypoints.map((w) => w.stop)} destination={state.destination.stop} />
          {results && <ResultMarkers places={results} selectedId={selectedPlace?.id ?? null} onSelect={setSelectedPlace} />}
          <MyLocationMarker position={geo.position} />
          <FitBounds points={fitPoints} deps={fitKey} />
          <PanTo position={selectedPlace?.location ?? null} />
        </Map>
        <MapLoadError />
      </div>

      <aside className="order-2 min-h-0 flex-1 overflow-y-auto border-t border-sand-200 bg-paper px-4 py-4 lg:order-1 lg:border-t-0 lg:border-r lg:px-5 lg:py-6">
        {selectedPlace ? (
          <PlaceDetail
            key={selectedPlace.id}
            place={selectedPlace}
            routeContext={routeContext}
            onClose={() => setSelectedPlace(null)}
            onAddAsWaypoint={(stop, index) => {
              dispatch({ type: "addWaypoint", key: newKey(), stop, index });
              setSelectedPlace(null);
            }}
            onSetEndpoint={(stop, which) => {
              dispatch({ type: "set", slot: { kind: which }, stop });
              setSelectedPlace(null);
            }}
          />
        ) : (
          <div className="space-y-6">
            <header className="hidden lg:block">
              <h1 className="text-2xl font-extrabold tracking-tight">{t.maps.title}</h1>
              <p className="text-sm text-stone-600">{t.maps.subtitle}</p>
            </header>
            {geo.error && <Alert tone="error">{geo.error}</Alert>}
            <RouteBuilder state={state} dispatch={dispatch} bias={geo.position ?? undefined} picking={picking}
              onPick={setPicking} onLocate={onLocate} locating={geo.status === "locating"} />
            <RouteSummary result={route.error ? null : routeResult} selected={state.selectedRoute}
              onSelect={(i) => dispatch({ type: "selectRoute", index: i })}
              loading={route.loading} error={route.error ?? null} hasWaypoints={state.waypoints.length > 0} />
            <DiscoverPanel hasRoute={!!polyline} category={category} onCategory={chooseCategory} radius={radius} onRadius={setRadius}
              results={results} loading={search.loading} error={search.error ?? null} selectedId={null} onSelect={setSelectedPlace} />
          </div>
        )}
      </aside>
    </div>
  );
}
