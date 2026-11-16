import "server-only";
import type { LatLng } from "@/lib/geo";
import { MapsError } from "./errors";
import { googleJson, parseDuration } from "./http";

export type Waypoint = { placeId?: string; location?: LatLng };

export type ComputedRoute = {
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number;
  encodedPolyline: string;
  description: string | null;
  labels: string[];
  warnings: string[];
  legs: { distanceMeters: number; durationSeconds: number }[];
  viewport: { low: LatLng; high: LatLng } | null;
};

export type RouteResponse = {
  routes: ComputedRoute[];
  /** Faturalanan SKU (Essentials: ≤10 ara durak, trafiksiz) */
  sku: "essentials" | "pro";
  alternativesSupported: boolean;
};

export const MAX_INTERMEDIATES = 25;
const ESSENTIALS_MAX_INTERMEDIATES = 10;

const FIELD_MASK = [
  "routes.distanceMeters", "routes.duration", "routes.staticDuration", "routes.polyline.encodedPolyline",
  "routes.description", "routes.routeLabels", "routes.warnings", "routes.viewport",
  "routes.legs.distanceMeters", "routes.legs.duration",
].join(",");

function toWaypoint(w: Waypoint) {
  // Place ID varsa onu kullan (Google yerin giriş noktasını bilir); yoksa koordinat
  if (w.placeId) return { placeId: w.placeId };
  if (w.location) return { location: { latLng: { latitude: w.location.lat, longitude: w.location.lng } } };
  throw new MapsError("invalid_request", "waypoint without placeId/location");
}

type GLatLng = { latitude: number; longitude: number };
type GRoute = {
  distanceMeters?: number; duration?: string; staticDuration?: string;
  polyline?: { encodedPolyline?: string }; description?: string; routeLabels?: string[];
  warnings?: string[]; viewport?: { low: GLatLng; high: GLatLng };
  legs?: { distanceMeters?: number; duration?: string }[];
};

export function buildComputeRoutesBody(input: {
  origin: Waypoint; destination: Waypoint; intermediates: Waypoint[]; alternatives: boolean; trafficAware: boolean;
}) {
  if (input.intermediates.length > MAX_INTERMEDIATES) throw new MapsError("invalid_request", "too many intermediates");
  const hasIntermediates = input.intermediates.length > 0;
  return {
    origin: toWaypoint(input.origin),
    destination: toWaypoint(input.destination),
    ...(hasIntermediates ? { intermediates: input.intermediates.map(toWaypoint) } : {}),
    travelMode: "DRIVE",
    routingPreference: input.trafficAware ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE",
    // Ara duraklı isteklerde Google alternatif rota döndürmez
    computeAlternativeRoutes: input.alternatives && !hasIntermediates,
    polylineQuality: "HIGH_QUALITY",
    languageCode: "tr",
    regionCode: "TR",
    units: "METRIC",
  };
}

export function skuFor(intermediateCount: number, trafficAware: boolean): RouteResponse["sku"] {
  return trafficAware || intermediateCount > ESSENTIALS_MAX_INTERMEDIATES ? "pro" : "essentials";
}

export async function computeRoutes(input: {
  origin: Waypoint; destination: Waypoint; intermediates: Waypoint[]; alternatives: boolean; trafficAware: boolean;
}): Promise<RouteResponse> {
  const body = buildComputeRoutesBody(input);
  const data = await googleJson<{ routes?: GRoute[] }>("https://routes.googleapis.com/directions/v2:computeRoutes", {
    body, fieldMask: FIELD_MASK, timeoutMs: 15_000,
  });
  const routes = (data.routes ?? [])
    .filter((r) => r.polyline?.encodedPolyline)
    .map<ComputedRoute>((r) => ({
      distanceMeters: r.distanceMeters ?? 0,
      durationSeconds: parseDuration(r.duration),
      staticDurationSeconds: parseDuration(r.staticDuration ?? r.duration),
      encodedPolyline: r.polyline!.encodedPolyline!,
      description: r.description ?? null,
      labels: r.routeLabels ?? [],
      warnings: r.warnings ?? [],
      legs: (r.legs ?? []).map((l) => ({ distanceMeters: l.distanceMeters ?? 0, durationSeconds: parseDuration(l.duration) })),
      viewport: r.viewport
        ? { low: { lat: r.viewport.low.latitude, lng: r.viewport.low.longitude }, high: { lat: r.viewport.high.latitude, lng: r.viewport.high.longitude } }
        : null,
    }));
  if (!routes.length) throw new MapsError("zero_results", "no route");
  return {
    routes,
    sku: skuFor(input.intermediates.length, input.trafficAware),
    alternativesSupported: input.intermediates.length === 0,
  };
}
