import { decodePolyline, insertionIndexForLegs, projectOntoPolyline } from "@/lib/geo";
import { MAX_WAYPOINTS, routeRequest, type ExplorerState } from "./explorer-state";
import { DEFAULT_ROUTE_OPTIONS, type RouteOption, type RouteOptions, type Stop } from "./types";

export type TripFields = { title: string; description: string; plannedDate: string };

/** Kaydedilmiş duraklardan (başlangıç…varış) planlayıcı durumu. */
export function stateFromStops(stops: Stop[], options: RouteOptions = DEFAULT_ROUTE_OPTIONS): ExplorerState {
  const origin = stops[0] ?? null;
  const destination = stops.length > 1 ? stops[stops.length - 1] : null;
  return {
    origin: { key: "origin", stop: origin },
    destination: { key: "destination", stop: destination },
    waypoints: stops.slice(1, -1).map((s, i) => ({ key: `w${i}-${s.id}`, stop: s })),
    selectedRoute: 0,
    options,
  };
}

/** Kaydedilecek sıralı duraklar; başlangıç/varış eksikse ya da boş ara durak varsa null. */
export function orderedStops(state: ExplorerState): Stop[] | null {
  const req = routeRequest(state);
  return req ? [req.origin, ...req.waypoints, req.destination] : null;
}

/**
 * Kaydedilmemiş değişiklik tespiti için planın parmak izi.
 * Durak kimlikleri değil konumlar karşılaştırılır (aynı yer yeniden seçilirse değişiklik sayılmaz).
 */
export function planFingerprint(fields: TripFields, state: ExplorerState, routeDistance: number | null): string {
  const stops = [state.origin.stop, ...state.waypoints.map((w) => w.stop), state.destination.stop].map((s) =>
    s ? `${s.location.lat.toFixed(6)},${s.location.lng.toFixed(6)},${s.label}` : "-",
  );
  const o = state.options;
  return JSON.stringify([fields.title.trim(), fields.description.trim(), fields.plannedDate, stops, routeDistance,
    [o.avoidTolls, o.avoidHighways, o.avoidFerries]]);
}

/** Kaydedilmiş rotaya en yakın alternatif (yeniden açılan planda kullanıcının seçtiği rota korunur). */
export function closestRouteIndex(routes: RouteOption[], distanceMeters: number | null): number {
  if (distanceMeters === null || routes.length < 2) return 0;
  let best = 0;
  for (let i = 1; i < routes.length; i++) {
    if (Math.abs(routes[i].distanceMeters - distanceMeters) < Math.abs(routes[best].distanceMeters - distanceMeters)) best = i;
  }
  return best;
}

/** "Konumum · Alemdar, Fatih, İstanbul" → "Alemdar"; "Ankara" → "Ankara". */
export function shortPlaceName(label: string): string {
  const withoutPrefix = label.includes(" · ") ? label.slice(label.indexOf(" · ") + 3) : label;
  return withoutPrefix.split(",")[0].trim() || label.trim();
}

/**
 * Kayıtlı plana dışarıdan (Keşfet → "Yolculuğa ekle") bir durak ekler: kayıtlı rota varsa yerin rota
 * boyunca konumuna göre doğru bacağa, yoksa varıştan önceye. Durak sınırı doluysa ya da yer zaten
 * planda varsa durum değişmez (inserted: false).
 */
export function withInsertedStop(state: ExplorerState, stop: Stop, route: RouteOption | null): { state: ExplorerState; inserted: boolean; reason?: "duplicate" | "full" } {
  const all = [state.origin.stop, ...state.waypoints.map((w) => w.stop), state.destination.stop];
  const same = (s: Stop | null) =>
    !!s && ((!!stop.ref && s.ref === stop.ref) || (Math.abs(s.location.lat - stop.location.lat) < 1e-5 && Math.abs(s.location.lng - stop.location.lng) < 1e-5));
  if (all.some(same)) return { state, inserted: false, reason: "duplicate" };
  if (!state.origin.stop || !state.destination.stop) {
    const slot = !state.origin.stop ? "origin" : "destination";
    return { state: { ...state, [slot]: { ...state[slot], stop }, selectedRoute: 0 }, inserted: true };
  }
  if (state.waypoints.length >= MAX_WAYPOINTS) return { state, inserted: false, reason: "full" };
  let index = state.waypoints.length;
  if (route && route.legs.length === state.waypoints.length + 1) {
    try {
      const proj = projectOntoPolyline(stop.location, decodePolyline(route.encodedPolyline));
      index = insertionIndexForLegs(proj.alongDistance, route.legs.map((l) => l.distanceMeters));
    } catch {
      // bozuk polyline: varıştan önceye ekle
    }
  }
  const waypoints = [...state.waypoints];
  waypoints.splice(Math.max(0, Math.min(index, waypoints.length)), 0, { key: `ins-${stop.id}`, stop });
  return { state: { ...state, waypoints, selectedRoute: 0 }, inserted: true };
}
