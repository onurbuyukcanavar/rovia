import { routeRequest, type ExplorerState } from "./explorer-state";
import type { RouteOption, Stop } from "./types";

export type TripFields = { title: string; description: string; plannedDate: string };

/** Kaydedilmiş duraklardan (başlangıç…varış) planlayıcı durumu. */
export function stateFromStops(stops: Stop[]): ExplorerState {
  const origin = stops[0] ?? null;
  const destination = stops.length > 1 ? stops[stops.length - 1] : null;
  return {
    origin: { key: "origin", stop: origin },
    destination: { key: "destination", stop: destination },
    waypoints: stops.slice(1, -1).map((s, i) => ({ key: `w${i}-${s.id}`, stop: s })),
    selectedRoute: 0,
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
  return JSON.stringify([fields.title.trim(), fields.description.trim(), fields.plannedDate, stops, routeDistance]);
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
