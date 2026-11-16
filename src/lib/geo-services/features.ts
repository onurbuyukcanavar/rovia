import "server-only";
import { decodePolyline, simplifyToMaxPoints, type LatLng } from "@/lib/geo";
import { normalizeForSearch } from "@/lib/places/normalize";
import { subtypeLabel } from "@/lib/places/labels";
import type { createClient } from "@/lib/supabase/server";
import { GeoError } from "./errors";
import { searchAddresses } from "./photon";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Feature = {
  id: string;
  name: string;
  /** "İlçe, İl" */
  address: string | null;
  location: LatLng;
  category: string;
  typeLabel: string | null;
  tags: Record<string, string>;
  distanceFromRoute: number;
  alongRoute: number | null;
};

export type Suggestion = {
  id: string;
  kind: "settlement" | "poi" | "address";
  name: string;
  secondary: string | null;
  location: LatLng;
};

const toTags = (v: unknown): Record<string, string> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};

function rpcError(fn: string, error: { code?: string; message: string }): GeoError {
  // 22023: fonksiyonun kendi girdi doğrulaması
  return new GeoError(error.code === "22023" ? "invalid_request" : "upstream", `${fn}: ${error.code} ${error.message}`);
}

/** Rota (precision-5 polyline) çevresinde kategori araması — kendi PostGIS veritabanımız. */
export async function searchAlongRoute(db: Supabase, input: { category: string; encodedPolyline: string; radiusMeters: number }): Promise<Feature[]> {
  let path: LatLng[];
  try {
    path = decodePolyline(input.encodedPolyline);
  } catch {
    throw new GeoError("invalid_request", "bad polyline");
  }
  if (path.length < 2) throw new GeoError("invalid_request", "polyline too short");
  // Yarıçaptan çok küçük sapmalar sonucu değiştirmez; nokta sayısını sınırla
  const simplified = simplifyToMaxPoints(path, 2_000, Math.min(50, input.radiusMeters / 20));
  const { data, error } = await db.rpc("search_features_along_route", {
    p_route: { type: "LineString", coordinates: simplified.map((p) => [p.lng, p.lat]) },
    p_categories: [input.category],
    p_radius_m: input.radiusMeters,
    p_limit: 80,
  });
  if (error) throw rpcError("search_features_along_route", error);
  return (data ?? []).map((r) => ({
    id: r.osm_ref!,
    name: r.name!,
    address: r.admin,
    location: { lat: r.lat!, lng: r.lng! },
    category: r.category!,
    typeLabel: subtypeLabel(r.subtype),
    tags: toTags(r.tags),
    distanceFromRoute: Math.round(r.distance_m ?? 0),
    alongRoute: Math.round(r.along_m ?? 0),
  }));
}

export async function searchNearby(db: Supabase, input: { category: string; center: LatLng; radiusMeters: number }): Promise<Feature[]> {
  const { data, error } = await db.rpc("search_features_nearby", {
    p_lat: input.center.lat,
    p_lng: input.center.lng,
    p_categories: [input.category],
    p_radius_m: input.radiusMeters,
    p_limit: 80,
  });
  if (error) throw rpcError("search_features_nearby", error);
  return (data ?? []).map((r) => ({
    id: r.osm_ref!,
    name: r.name!,
    address: r.admin,
    location: { lat: r.lat!, lng: r.lng! },
    category: r.category!,
    typeLabel: subtypeLabel(r.subtype),
    tags: toTags(r.tags),
    distanceFromRoute: Math.round(r.distance_m ?? 0),
    alongRoute: null,
  }));
}

/**
 * Yazarken arama: önce kendi veritabanımız (yerleşim + ilgi noktası); yeterli sonuç
 * yoksa sokak/adres için Photon yedeği. Photon hatası aramayı bozmaz (yalnızca loglanır).
 */
export async function autocomplete(db: Supabase, input: { text: string; bias?: LatLng }): Promise<Suggestion[]> {
  const q = normalizeForSearch(input.text);
  if (q.length < 2) return [];
  const { data, error } = await db.rpc("search_places", {
    p_query: q,
    p_lat: input.bias?.lat,
    p_lng: input.bias?.lng,
    p_limit: 8,
  });
  if (error) throw rpcError("search_places", error);
  const own: Suggestion[] = (data ?? []).map((r) => ({
    id: r.osm_ref!,
    kind: r.kind === "settlement" ? "settlement" : "poi",
    name: r.name!,
    secondary: [subtypeLabel(r.subtype), r.admin].filter(Boolean).join(" · ") || null,
    location: { lat: r.lat!, lng: r.lng! },
  }));
  if (own.length >= 5) return own;

  try {
    const addresses = await searchAddresses(input.text, input.bias, 8 - own.length);
    return [...own, ...addresses.map((a) => ({ ...a, kind: "address" as const }))];
  } catch (e) {
    console.error("[rovia] photon:", e instanceof GeoError ? `${e.code} ${e.message}` : e);
    return own;
  }
}

export async function reverseGeocode(db: Supabase, point: LatLng): Promise<{ label: string }> {
  const { data, error } = await db.rpc("reverse_geocode", { p_lat: point.lat, p_lng: point.lng });
  if (error) throw rpcError("reverse_geocode", error);
  const label = data?.[0]?.label;
  if (!label) throw new GeoError("zero_results", "no settlement nearby");
  return { label };
}
