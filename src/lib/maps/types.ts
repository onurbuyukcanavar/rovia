import type { LatLng } from "@/lib/geo";

/** Haritada seçilmiş bir nokta (başlangıç, ara durak, varış). */
export type Stop = {
  id: string;
  label: string;
  address: string | null;
  /** OpenStreetMap kaydı (n123/w456/r789) — varsa; favori ve seyahatname bağlantıları için */
  ref: string | null;
  location: LatLng;
};

export type RouteLeg = { distanceMeters: number; durationSeconds: number };

/** Google Maps'teki rota seçenekleriyle aynı üçlü. */
export type RouteOptions = { avoidTolls: boolean; avoidHighways: boolean; avoidFerries: boolean };
export const DEFAULT_ROUTE_OPTIONS: RouteOptions = { avoidTolls: false, avoidHighways: false, avoidFerries: false };

export type StepKind = "depart" | "arrive" | "left" | "right" | "straight" | "uturn" | "roundabout" | "ferry" | "merge" | "ramp";

/** Yol tarifi adımı (Valhalla manevrası, Türkçe). */
export type RouteStep = {
  instruction: string;
  kind: StepKind;
  distanceMeters: number;
  durationSeconds: number;
  location: LatLng;
  toll: boolean;
};

export type RouteOption = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  legs: RouteLeg[];
  /** Ücretli yol/köprü (feribot ücreti hariç) */
  hasToll: boolean;
  hasFerry: boolean;
  hasHighway: boolean;
  /** İstisna köprüler (15 Temmuz, FSM, 1915 Çanakkale): ücretli yol sayılmaz ama geçiş ücretlidir */
  tollBridges?: string[];
  steps?: RouteStep[];
};

export type RouteResult = { routes: RouteOption[]; alternativesSupported: boolean };

export type Suggestion = {
  id: string;
  kind: "settlement" | "poi" | "address";
  name: string;
  secondary: string | null;
  location: LatLng;
};

export type FoundPlace = {
  id: string;
  name: string;
  address: string | null;
  location: LatLng;
  category: string;
  typeLabel: string | null;
  tags: Record<string, string>;
  distanceFromRoute: number;
  alongRoute: number | null;
};
