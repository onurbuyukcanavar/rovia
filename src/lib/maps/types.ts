import type { LatLng } from "@/lib/geo";

/** Haritada seçilmiş bir nokta (başlangıç, ara durak, varış). */
export type Stop = {
  id: string;
  label: string;
  address: string | null;
  placeId: string | null;
  location: LatLng;
};

export type RouteLeg = { distanceMeters: number; durationSeconds: number };

export type RouteOption = {
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number;
  encodedPolyline: string;
  description: string | null;
  labels: string[];
  warnings: string[];
  legs: RouteLeg[];
  viewport: { low: LatLng; high: LatLng } | null;
};

export type RouteResult = { routes: RouteOption[]; sku: "essentials" | "pro"; alternativesSupported: boolean };

export type Suggestion = { placeId: string; mainText: string; secondaryText: string | null };

export type FoundPlace = {
  id: string;
  name: string;
  address: string | null;
  location: LatLng;
  typeLabel: string | null;
  distanceFromRoute: number;
  alongRoute: number | null;
};

/** Detay yanıtı; rotaya uzaklık istemcide hesaplanır, burada yoktur. */
export type PlaceDetails = Omit<FoundPlace, "distanceFromRoute" | "alongRoute"> & {
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  openingHours: string[];
  phone: string | null;
  phoneInternational: string | null;
  website: string | null;
  googleMapsUri: string | null;
  photo: { name: string; attributions: { name: string; uri: string | null }[] } | null;
};
