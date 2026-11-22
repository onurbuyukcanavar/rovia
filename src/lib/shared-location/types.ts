import type { LocationSource } from "./parse";

/** /api/location/resolve yanıtı. */
export type ResolvedLocation = {
  lat: number;
  lng: number;
  label: string | null;
  /** Yer adı yoksa en yakın yerleşim ("İlçe, İl") */
  address: string | null;
  source: LocationSource;
  /** Koordinat yaklaşık (harita görünümü merkezi ya da ada göre arama sonucu) */
  approximate: boolean;
};
