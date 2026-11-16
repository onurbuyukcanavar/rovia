import type { Stop } from "./types";

/** Valhalla herkese açık sunucusu en fazla 20 konum kabul eder (başlangıç + 18 + varış). */
export const MAX_WAYPOINTS = 18;

/** Rota kurucusundaki bir satır: dolu (Stop) veya henüz seçilmemiş (null). */
export type Slot = { key: string; stop: Stop | null };

export type ExplorerState = {
  origin: Slot;
  destination: Slot;
  waypoints: Slot[];
  selectedRoute: number;
};

export type SlotRef = { kind: "origin" } | { kind: "destination" } | { kind: "waypoint"; key: string };

export type ExplorerAction =
  | { type: "set"; slot: SlotRef; stop: Stop | null }
  | { type: "addWaypoint"; key: string; stop?: Stop | null; index?: number }
  | { type: "removeWaypoint"; key: string }
  | { type: "moveWaypoint"; key: string; delta: -1 | 1 }
  | { type: "swapEnds" }
  | { type: "selectRoute"; index: number }
  | { type: "reset" };

let counter = 0;
export const newKey = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const initialExplorerState = (): ExplorerState => ({
  origin: { key: "origin", stop: null },
  destination: { key: "destination", stop: null },
  waypoints: [],
  selectedRoute: 0,
});

export function explorerReducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  // Duraklar değişince seçili alternatif sıfırlanır (alternatifler yeniden hesaplanır)
  const routeChanged = (s: ExplorerState): ExplorerState => ({ ...s, selectedRoute: 0 });

  switch (action.type) {
    case "set": {
      const { slot, stop } = action;
      if (slot.kind === "origin") return routeChanged({ ...state, origin: { ...state.origin, stop } });
      if (slot.kind === "destination") return routeChanged({ ...state, destination: { ...state.destination, stop } });
      return routeChanged({
        ...state,
        waypoints: state.waypoints.map((w) => (w.key === slot.key ? { ...w, stop } : w)),
      });
    }
    case "addWaypoint": {
      if (state.waypoints.length >= MAX_WAYPOINTS) return state;
      const slot: Slot = { key: action.key, stop: action.stop ?? null };
      const waypoints = [...state.waypoints];
      const at = action.index === undefined ? waypoints.length : Math.max(0, Math.min(action.index, waypoints.length));
      waypoints.splice(at, 0, slot);
      return routeChanged({ ...state, waypoints });
    }
    case "removeWaypoint":
      return routeChanged({ ...state, waypoints: state.waypoints.filter((w) => w.key !== action.key) });
    case "moveWaypoint": {
      const i = state.waypoints.findIndex((w) => w.key === action.key);
      const j = i + action.delta;
      if (i < 0 || j < 0 || j >= state.waypoints.length) return state;
      const waypoints = [...state.waypoints];
      [waypoints[i], waypoints[j]] = [waypoints[j], waypoints[i]];
      return routeChanged({ ...state, waypoints });
    }
    case "swapEnds":
      return routeChanged({
        ...state,
        origin: { ...state.origin, stop: state.destination.stop },
        destination: { ...state.destination, stop: state.origin.stop },
        waypoints: [...state.waypoints].reverse(),
      });
    case "selectRoute":
      return { ...state, selectedRoute: action.index };
    case "reset":
      return initialExplorerState();
  }
}

/** Rota hesaplanabilir mi? Başlangıç + varış dolu ve boş ara durak yok. */
export function routeRequest(state: ExplorerState) {
  const { origin, destination, waypoints } = state;
  if (!origin.stop || !destination.stop) return null;
  if (waypoints.some((w) => !w.stop)) return null;
  return { origin: origin.stop, destination: destination.stop, waypoints: waypoints.map((w) => w.stop!) };
}

/** İstek parmak izi: aynı duraklar için tekrar istek atılmasını önler. */
export function routeRequestKey(state: ExplorerState): string | null {
  const req = routeRequest(state);
  if (!req) return null;
  const id = (s: Stop) => `${s.location.lat.toFixed(6)},${s.location.lng.toFixed(6)}`;
  return [id(req.origin), ...req.waypoints.map(id), id(req.destination)].join("|");
}
