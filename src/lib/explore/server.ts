import "server-only";
import { decodePolyline, simplifyToMaxPoints, type LatLng } from "@/lib/geo";
import { GeoError } from "@/lib/geo-services/errors";
import { subtypeLabel } from "@/lib/places/labels";
import type { createClient } from "@/lib/supabase/server";
import { maxAreaFor, type ExploreCategory } from "./categories";
import { bboxArea, type BBox } from "./geo";
import type { ExplorePlace, ExploreResponse } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ExploreInput = {
  category: ExploreCategory;
  bbox?: BBox;
  encodedPolyline?: string;
  radiusMeters?: number;
  limit?: number;
};

const toTags = (v: unknown): Record<string, string> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
};

/** Keşfet: harita alanı (bbox) veya rota boyunca (polyline + yarıçap) explore_features. */
export async function exploreFeatures(db: Supabase, input: ExploreInput): Promise<ExploreResponse> {
  let route: { type: "LineString"; coordinates: number[][] } | null = null;
  if (input.encodedPolyline) {
    let path: LatLng[];
    try {
      path = decodePolyline(input.encodedPolyline);
    } catch {
      throw new GeoError("invalid_request", "bad polyline");
    }
    if (path.length < 2) throw new GeoError("invalid_request", "polyline too short");
    const radius = input.radiusMeters ?? 5_000;
    const simplified = simplifyToMaxPoints(path, 2_000, Math.min(50, radius / 20));
    route = { type: "LineString", coordinates: simplified.map((p) => [p.lng, p.lat]) };
  } else if (!input.bbox) {
    throw new GeoError("invalid_request", "bbox or route required");
  } else if (bboxArea(input.bbox) > maxAreaFor(input.category)) {
    // Kullanıcıya hata değil "yakınlaştır" ipucu gösterilir
    return { places: [], tooLarge: true };
  }

  const { data, error } = await db.rpc("explore_features", {
    p_category: input.category,
    p_bbox: route ? undefined : input.bbox,
    p_route: route ?? undefined,
    p_radius_m: input.radiusMeters ?? 5_000,
    p_limit: input.limit ?? 150,
  });
  if (error) {
    if (error.message.includes("area_too_large")) return { places: [], tooLarge: true };
    throw new GeoError(error.code === "22023" ? "invalid_request" : "upstream", `explore_features: ${error.code} ${error.message}`);
  }
  const places: ExplorePlace[] = (data ?? [])
    .filter((r) => r.osm_ref && r.name && r.lat !== null && r.lng !== null)
    .map((r) => ({
      id: r.osm_ref!,
      name: r.name!,
      kind: r.kind === "settlement" ? "settlement" : "poi",
      category: r.category ?? "",
      subtype: r.subtype,
      typeLabel: subtypeLabel(r.subtype),
      admin: r.admin,
      tags: toTags(r.tags),
      location: { lat: r.lat!, lng: r.lng! },
      importance: r.importance ?? 0,
      distanceM: r.distance_m === null ? null : Math.round(r.distance_m),
      alongM: r.along_m === null ? null : Math.round(r.along_m),
    }));
  // Rota boyunca: yolculuk sırasına göre
  if (route) places.sort((a, b) => (a.alongM ?? 0) - (b.alongM ?? 0));
  return { places };
}
