import type { LatLng } from "@/lib/geo";
import type { FoundPlace } from "@/lib/maps/types";

/** Keşif sonucu (explore_features satırı, istemciye uygun biçim). */
export type ExplorePlace = {
  /** OSM kaydı: n123 / w456 / r789 */
  id: string;
  name: string;
  kind: "poi" | "settlement";
  category: string;
  subtype: string | null;
  typeLabel: string | null;
  /** "İlçe, İl" */
  admin: string | null;
  tags: Record<string, string>;
  location: LatLng;
  importance: number;
  /** Rota modunda: rotaya uzaklık ve rota başından mesafe (metre) */
  distanceM: number | null;
  alongM: number | null;
};

export type ExploreResponse = { places: ExplorePlace[]; tooLarge?: boolean };

/** Planlayıcıdaki ortak bileşenler (favori düğmeleri) için dönüştürme. */
export function toFoundPlace(p: ExplorePlace): FoundPlace {
  return {
    id: p.id, name: p.name, address: p.admin, location: p.location, category: p.category, typeLabel: p.typeLabel,
    tags: p.tags, distanceFromRoute: p.distanceM ?? 0, alongRoute: p.alongM,
  };
}

/** Rotası olan (planlanmış / etkin) yolculuk — Keşfet'te seçim için. */
export type RouteTrip = { id: string; title: string; status: string; polyline: string };
