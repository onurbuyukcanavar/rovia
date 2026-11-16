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

export type RouteOption = {
  distanceMeters: number;
  durationSeconds: number;
  encodedPolyline: string;
  legs: RouteLeg[];
  hasToll: boolean;
  hasFerry: boolean;
  hasHighway: boolean;
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
