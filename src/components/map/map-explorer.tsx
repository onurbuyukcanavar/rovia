"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { NavigationControl, ScaleControl, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { MapView } from "@/lib/maps/maplibre-setup";
import { useCallback, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookmarkPlus, Compass } from "lucide-react";
import { decodePolyline, type LatLng } from "@/lib/geo";
import { mapsApi } from "@/lib/maps/client";
import {
  explorerReducer, initialExplorerState, MAX_WAYPOINTS, newKey, routeRequest, routeRequestKey, type SlotRef,
} from "@/lib/maps/explorer-state";
import type { FoundPlace, RouteOption, RouteResult, Stop } from "@/lib/maps/types";
import {
  closestRouteIndex, orderedStops, planFingerprint, shortPlaceName, stateFromStops, withInsertedStop, type TripFields,
} from "@/lib/maps/trip-draft";
import { useLeaveGuard } from "@/lib/maps/use-leave-guard";
import { FavoriteActions, FavoritePicker, favoriteToStop } from "@/components/favorites/favorite-actions";
import type { FavoriteStopItem, ListType } from "@/lib/favorites/types";
import { saveTripPlan } from "@/lib/actions/trips";
import type { EditableTrip } from "@/lib/queries/trips";
import { Button } from "@/components/ui/button";
import { SaveBar, TripDetailsForm } from "@/components/trips/trip-plan-panel";
import { useGeolocation } from "@/lib/maps/use-geolocation";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import { Alert } from "@/components/ui/alert";
import { DiscoverPanel } from "./discover-panel";
import { ALT_ROUTE_LAYER, FitBounds, FocusMarker, MyLocationMarker, PanTo, ResultMarkers, RouteLines, StopMarkers, SuggestionMarkers } from "./map-layers";
import { MapFrame, isMobileViewport, useMapExpand } from "./map-frame";
import { PlaceDetail } from "./place-detail";
import { RouteBuilder } from "./route-builder";
import { RouteSummary } from "./route-summary";
import { RouteDirections, RouteOptionsBar, RouteSuggestions } from "./route-extras";
import { t } from "@/i18n";
import { ThemedMapStyle } from "@/components/theme/themed-map-style";

const TURKEY_CENTER = { lat: 39.0, lng: 35.2 };

const OSM_REF = /^[nwr][0-9]{1,19}$/;
const EMPTY_FIELDS: TripFields = { title: "", description: "", plannedDate: "" };

type Props = {
  styleUrl: string;
  /** explore: Haritayı Keşfet (isteğe bağlı kaydetme) · plan: Yolculuk Planla */
  mode?: "explore" | "plan";
  /** Düzenlenen kayıtlı yolculuk; yeni planda null */
  trip?: EditableTrip | null;
  /** Kullanıcının kayıtlı yerleri (favori düğmeleri ve "Favorilerimden ekle") */
  favorites?: FavoriteStopItem[];
  /** /planla?hedef=<favori> ile açılınca varış noktası */
  initialDestination?: Stop | null;
  /** /planla/<id>?yer=…: Keşfet'ten "Yolculuğa ekle" ile gelen durak (kayıtlı plana eklenir, kaydetmek kullanıcıda) */
  insertStop?: Stop | null;
};

/**
 * Haritayı Keşfet ve Yolculuk Planla — tamamen açık kaynak altyapı:
 * MapLibre GL JS (çizim) + OpenFreeMap (karolar, OSM) + Valhalla (rota) + ROVIA PostGIS (arama).
 */
export function MapExplorer({ styleUrl, mode = "explore", trip = null, favorites = [], initialDestination = null, insertStop = null }: Props) {
  // Kayıtlı planın kendisi (kaydedilmemiş değişiklik ve kayıtlı rota karşılaştırmaları bununla yapılır)
  const [savedState] = useState(() => (trip ? stateFromStops(trip.stops, trip.routeOptions) : null));
  const [insertResult] = useState(() =>
    savedState && insertStop ? { name: insertStop.label, ...withInsertedStop(savedState, insertStop, trip?.route ?? null) } : null,
  );
  const [state, dispatch] = useReducer(explorerReducer, trip, (tr) => {
    if (tr) return insertResult?.state ?? savedState ?? stateFromStops(tr.stops, tr.routeOptions);
    const init = initialExplorerState();
    return initialDestination ? { ...init, destination: { ...init.destination, stop: initialDestination } } : init;
  });
  // OSM kaydına göre kayıtlı yerler (ayrıntı panelinde "kayıtlı" durumu); bu oturumda eklenenler de işlenir
  const [savedRefs, setSavedRefs] = useState<Map<string, ListType>>(
    () => new Map(favorites.filter((f) => f.osmRef).map((f) => [f.osmRef!, f.listType])),
  );
  const [picking, setPicking] = useState<SlotRef | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng>(TURKEY_CENTER);
  const [category, setCategory] = useState<string | null>(null);
  const [radius, setRadius] = useState(5_000);
  const [selectedPlace, setSelectedPlace] = useState<FoundPlace | null>(null);
  const [mapError, setMapError] = useState(false);
  const mapView = useMapExpand();
  const geo = useGeolocation();
  /** Kullanıcı alternatif rotayı kendisi seçti mi (kaydedilmemiş değişiklik sayılır) */
  const [routeTouched, setRouteTouched] = useState(false);

  // ---------------------------------------------------------------- Rota hesaplama
  // reqKey isteğin tüm girdilerini kapsar; aynı duraklar için tekrar istek atılmaz
  const reqKey = routeRequestKey(state);
  const route = useKeyedRequest<RouteResult>(
    reqKey,
    (signal) => mapsApi.route(routeRequest(state)!, { alternatives: true }, signal),
    { delayMs: 500, keepPrevious: true },
  );

  // Kayıtlı plan açıldığında: kullanıcının seçtiği alternatif korunur (kayıtlı mesafeye en yakın rota)
  const [initialKey] = useState(() => routeRequestKey(savedState ?? state));
  const [preferSaved, setPreferSaved] = useState(!!trip?.route);
  if (preferSaved && !route.loading) {
    setPreferSaved(false);
    if (route.data && reqKey === initialKey) {
      const index = closestRouteIndex(route.data.routes, trip!.route!.distanceMeters);
      if (index !== state.selectedRoute) dispatch({ type: "selectRoute", index });
    }
  }
  // Rota servisine ulaşılamazsa ve duraklar değişmediyse kayıtlı rota gösterilir
  const usingSavedRoute = !!trip?.route && !!route.error && reqKey === initialKey;
  const routeResult: RouteResult | null = usingSavedRoute
    ? { routes: [trip!.route!], alternativesSupported: false }
    : route.error ? null : (route.data ?? null);
  const selectedIndex = routeResult && state.selectedRoute < routeResult.routes.length ? state.selectedRoute : 0;
  const selectedRoute = routeResult?.routes[selectedIndex] ?? null;
  const polyline = selectedRoute?.encodedPolyline ?? null;

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

  // ---------------------------------------------------------------- Rota üzerindeki öneriler
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const sugKey = polyline && !suggestionsHidden ? `sug|${polyline.length}:${polyline.slice(0, 24)}:${polyline.slice(-24)}` : null;
  const suggestions = useKeyedRequest<FoundPlace[]>(sugKey, (signal) => mapsApi.suggestAlongRoute(polyline!, signal), { delayMs: 700 });
  const stopRefs = useMemo(
    () => new Set([state.origin.stop, state.destination.stop, ...state.waypoints.map((w) => w.stop)].map((st) => st?.ref).filter((r): r is string => !!r)),
    [state],
  );
  const suggested = useMemo(
    () => (suggestionsHidden || !polyline ? [] : (suggestions.data ?? []).filter((p) => !stopRefs.has(p.id))),
    [suggestions.data, stopRefs, suggestionsHidden, polyline],
  );
  const chooseCategory = (key: string | null) => {
    setSearchCenter(mapCenter);
    setCategory(key);
  };

  // ---------------------------------------------------------------- Haritadan seçim / konum
  const stopFromPoint = useCallback(async (point: LatLng, fallbackLabel: string): Promise<Stop> => {
    const base = { id: newKey(), address: null, ref: null, location: point };
    try {
      const g = await mapsApi.reverseGeocode(point);
      return { ...base, label: g.label };
    } catch {
      return { ...base, label: fallbackLabel };
    }
  }, []);

  const onMapClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      // Alternatif rotaya tıklama → o rotayı seç
      const alt = e.features?.find((f) => f.layer.id === ALT_ROUTE_LAYER);
      if (alt && !picking) {
        dispatch({ type: "selectRoute", index: Number(alt.properties?.index ?? 0) });
        setRouteTouched(true);
        return;
      }
      if (!picking) {
        // Telefonda haritaya dokununca harita tam ekran olur
        if (!mapView.expanded && isMobileViewport()) mapView.expand();
        return;
      }
      const slot = picking;
      setPicking(null);
      const point = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      const stop = await stopFromPoint(point, `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
      dispatch({ type: "set", slot, stop });
    },
    [picking, stopFromPoint, mapView],
  );

  const onLocate = useCallback(async () => {
    const pos = await geo.locate();
    if (!pos) return;
    const stop = await stopFromPoint(pos, t.maps.myLocation);
    dispatch({ type: "set", slot: { kind: "origin" }, stop: { ...stop, label: `${t.maps.myLocation} · ${stop.label}` } });
  }, [geo, stopFromPoint]);

  // ---------------------------------------------------------------- Yolculuk planı (kaydetme)
  const [planOpen, setPlanOpen] = useState(mode === "plan" || !!trip);
  const [fields, setFields] = useState<TripFields>(() =>
    trip ? { title: trip.title, description: trip.description ?? "", plannedDate: trip.plannedDate ?? "" } : EMPTY_FIELDS,
  );
  const [saved, setSaved] = useState(() => ({
    id: trip?.id ?? null,
    version: trip?.version ?? null,
    fingerprint: planFingerprint(fields, savedState ?? state, null),
    savedAt: null as string | null,
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fingerprint = planFingerprint(fields, state, null);
  const dirty = planOpen && (fingerprint !== saved.fingerprint || routeTouched);
  useLeaveGuard(dirty, t.trips.leaveWarning);

  const stops = orderedStops(state);
  const titleSuggestion =
    state.origin.stop && state.destination.stop
      ? t.trips.suggestedName(shortPlaceName(state.origin.stop.label), shortPlaceName(state.destination.stop.label))
      : null;
  const routePending = route.loading && !usingSavedRoute;
  const blockedReason = !state.origin.stop || !state.destination.stop
    ? t.trips.needEndpoints
    : !stops ? t.trips.needAllStops
    : routePending ? t.trips.waitRoute
    : null;
  const saveNote = usingSavedRoute ? t.trips.savedRouteNote : stops && !routePending && !selectedRoute ? t.trips.routeless : null;

  const selectRoute = (index: number) => {
    dispatch({ type: "selectRoute", index });
    setRouteTouched(true);
  };

  async function savePlan() {
    if (!stops || saving || blockedReason) return;
    const title = fields.title.trim() || titleSuggestion || "";
    const savedFields = { ...fields, title };
    const savedFingerprint = planFingerprint(savedFields, state, null);
    const routeToSave: RouteOption | null = selectedRoute;
    setSaving(true);
    setSaveError(null);
    setFieldErrors({});
    try {
      const res = await saveTripPlan({
        id: saved.id,
        version: saved.version,
        title,
        description: fields.description,
        plannedDate: fields.plannedDate,
        stops: stops.map((s) => ({
          name: s.label.slice(0, 200),
          address: s.address?.slice(0, 500) ?? null,
          lat: s.location.lat,
          lng: s.location.lng,
          ref: s.ref && OSM_REF.test(s.ref) ? s.ref : null,
        })),
        route: routeToSave
          ? {
              encodedPolyline: routeToSave.encodedPolyline,
              distanceMeters: Math.round(routeToSave.distanceMeters),
              durationSeconds: Math.round(routeToSave.durationSeconds),
              legs: routeToSave.legs.map((l) => ({ distanceMeters: Math.round(l.distanceMeters), durationSeconds: Math.round(l.durationSeconds) })),
              hasToll: routeToSave.hasToll,
              hasFerry: routeToSave.hasFerry,
            }
          : null,
        routeOptions: state.options,
      });
      if (res.ok) {
        setFields((f) => (f.title.trim() ? f : { ...f, title }));
        setSaved({ id: res.id, version: res.version, fingerprint: savedFingerprint, savedAt: res.savedAt });
        setRouteTouched(false);
        // Bileşeni yeniden yüklemeden adresi kalıcı plana çevir (yenileme ve paylaşma için)
        const target = `/planla/${res.id}`;
        if (window.location.pathname !== target) window.history.replaceState(null, "", target);
      } else {
        setSaveError(res.message);
        setFieldErrors(res.fieldErrors ?? {});
      }
    } catch {
      setSaveError(t.common.unexpectedError);
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------- Görünüm
  const stopPoints = useMemo(
    () => [state.origin.stop, ...state.waypoints.map((w) => w.stop), state.destination.stop].filter((s): s is Stop => !!s).map((s) => s.location),
    [state],
  );
  const fitPoints = useMemo(() => (selectedRoute ? decodePolyline(selectedRoute.encodedPolyline) : stopPoints), [selectedRoute, stopPoints]);
  const fitKey = selectedRoute ? `r:${reqKey}:${selectedIndex}` : `s:${stopPoints.map((p) => `${p.lat},${p.lng}`).join(";")}`;

  const routeContext = useMemo(() => {
    const req = routeRequest(state);
    if (!selectedRoute || !req) return null;
    return { route: selectedRoute, origin: req.origin, destination: req.destination, waypoints: req.waypoints, options: req.options };
  }, [selectedRoute, state]);

  return (
    <div className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr] relative lg:overflow-hidden">
      <MapFrame expanded={mapView.expanded} onExpand={mapView.expand} onCollapse={mapView.collapse}
        className="order-1 h-[45%] shrink-0 lg:order-2 lg:h-full" testId="map">
        <ThemedMapStyle styleUrl={styleUrl}>{(mapStyle) => (
          <MapView
            initialViewState={{ longitude: TURKEY_CENTER.lng, latitude: TURKEY_CENTER.lat, zoom: 5.2 }}
            mapStyle={mapStyle}
            style={{ width: "100%", height: "100%" }}
            cursor={picking ? "crosshair" : undefined}
            interactiveLayerIds={routeResult && routeResult.routes.length > 1 ? [ALT_ROUTE_LAYER] : []}
            onClick={onMapClick}
            onMoveEnd={(e) => setMapCenter({ lat: e.viewState.latitude, lng: e.viewState.longitude })}
            onError={(e) => {
              console.error("[rovia] harita:", e.error?.message);
              setMapError(true);
            }}
            attributionControl={{ compact: true }}
            dragRotate={false}
          >
            <NavigationControl position="top-right" showCompass={false} />
            <ScaleControl position="bottom-left" unit="metric" />
            {routeResult && <RouteLines routes={routeResult.routes} selected={selectedIndex} />}
            <StopMarkers origin={state.origin.stop} waypoints={state.waypoints.map((w) => w.stop)} destination={state.destination.stop} />
            {results && <ResultMarkers places={results} selectedId={selectedPlace?.id ?? null} onSelect={(p) => {
              setSelectedPlace(p);
              // Tam ekranda yer seçilince ayrıntısı görünsün
              if (mapView.expanded) mapView.collapse();
            }} />}
            <MyLocationMarker position={geo.position} />
            <FitBounds points={fitPoints} deps={fitKey} />
            <SuggestionMarkers places={suggested} selectedId={selectedPlace?.id ?? null} onSelect={(p) => {
              setSelectedPlace(p);
              if (mapView.expanded) mapView.collapse();
            }} />
            <FocusMarker position={focus} />
            <PanTo position={selectedPlace?.location ?? focus} />
          </MapView>
        )}</ThemedMapStyle>
        {mapError && (
          <div className="absolute inset-x-3 top-14 z-10">
            <Alert tone="error">{t.maps.loadError}</Alert>
          </div>
        )}
      </MapFrame>

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
            favoriteActions={
              <FavoriteActions place={selectedPlace} saved={savedRefs.get(selectedPlace.id) ?? null}
                onSaved={(list) => setSavedRefs((m) => new Map(m).set(selectedPlace.id, m.get(selectedPlace.id) ?? list))} />
            }
          />
        ) : (
          <div className="space-y-6">
            {planOpen ? (
              <header className="space-y-1">
                <Link href="/yolculuklar" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-ink-900">
                  <ArrowLeft className="size-4" aria-hidden /> {t.trips.backToList}
                </Link>
                <h1 className="text-2xl font-extrabold tracking-tight">{saved.id ? t.trips.editTitle : t.trips.planTitle}</h1>
                <p className="text-sm text-stone-600">{t.trips.planSubtitle}</p>
              </header>
            ) : (
              <header className="hidden lg:block">
                <h1 className="text-2xl font-extrabold tracking-tight">{t.maps.title}</h1>
                <p className="text-sm text-stone-600">{t.maps.subtitle}</p>
              </header>
            )}
            {insertResult && (
              <Alert tone={insertResult.reason === "full" ? "error" : "info"}>
                {insertResult.inserted ? t.explore.planner.inserted(insertResult.name)
                  : insertResult.reason === "full" ? t.explore.planner.full(insertResult.name) : t.explore.planner.already(insertResult.name)}
              </Alert>
            )}
            {geo.error && <Alert tone="error">{geo.error}</Alert>}
            {planOpen && (
              <TripDetailsForm fields={fields} onChange={setFields} titleSuggestion={titleSuggestion} fieldErrors={fieldErrors} />
            )}
            <RouteBuilder state={state} dispatch={dispatch} bias={geo.position ?? undefined} picking={picking}
              onPick={setPicking} onLocate={onLocate} locating={geo.status === "locating"} />
            {(planOpen || favorites.length > 0) && (
              <FavoritePicker favorites={favorites} disabled={!!state.origin.stop && !!state.destination.stop && state.waypoints.length >= MAX_WAYPOINTS}
                onPick={(f) => {
                  const stop = favoriteToStop(f);
                  if (!state.origin.stop) dispatch({ type: "set", slot: { kind: "origin" }, stop });
                  else if (!state.destination.stop) dispatch({ type: "set", slot: { kind: "destination" }, stop });
                  else {
                    // Boş ara durak varsa oraya, yoksa varıştan önceye
                    const empty = state.waypoints.find((w) => !w.stop);
                    if (empty) dispatch({ type: "set", slot: { kind: "waypoint", key: empty.key }, stop });
                    else dispatch({ type: "addWaypoint", key: newKey(), stop });
                  }
                }} />
            )}
            <RouteOptionsBar options={state.options} onChange={(o) => dispatch({ type: "setOptions", options: o })} />
            <RouteSummary result={routeResult} selected={selectedIndex} onSelect={selectRoute}
              loading={routePending} error={usingSavedRoute ? null : (route.error ?? null)} hasWaypoints={state.waypoints.length > 0} />
            {selectedRoute?.steps && <RouteDirections steps={selectedRoute.steps} onFocus={setFocus} />}
            {selectedRoute && (
              <RouteSuggestions route={selectedRoute} places={suggested} loading={suggestions.loading} error={suggestions.error ?? null}
                hidden={suggestionsHidden} onHidden={setSuggestionsHidden} waypointCount={state.waypoints.length}
                onAdd={(stop, index) => dispatch({ type: "addWaypoint", key: newKey(), stop, index })}
                onDetails={setSelectedPlace} />
            )}
            {saved.id && selectedRoute && (
              <Link href={`/kesfet?yolculuk=${saved.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline"
                data-testid="explore-along">
                <Compass className="size-4" aria-hidden /> {t.explore.planner.exploreAlong}
              </Link>
            )}
            {!planOpen && selectedRoute && (
              <Button type="button" variant="secondary" className="w-full" onClick={() => setPlanOpen(true)}>
                <BookmarkPlus className="size-4" aria-hidden /> {t.trips.saveAsTrip}
              </Button>
            )}
            <DiscoverPanel hasRoute={!!polyline} category={category} onCategory={chooseCategory} radius={radius} onRadius={setRadius}
              results={results} loading={search.loading} error={search.error ?? null} selectedId={null} onSelect={setSelectedPlace} />
            {planOpen && (
              <SaveBar isNew={!saved.id} dirty={dirty} saving={saving} savedAt={saved.savedAt} blockedReason={blockedReason}
                note={saveNote} error={saveError} onSave={savePlan} />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
