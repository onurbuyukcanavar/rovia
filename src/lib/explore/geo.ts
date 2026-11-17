import type { LatLng } from "@/lib/geo";

/** [batı, güney, doğu, kuzey] */
export type BBox = [number, number, number, number];

const OSM_TYPES = { n: "node", w: "way", r: "relation" } as const;
export const OSM_REF = /^[nwr][0-9]{1,19}$/;

/** "n123" → https://www.openstreetmap.org/node/123 ; geçersizse null. */
export function osmUrl(ref: string): string | null {
  if (!OSM_REF.test(ref)) return null;
  return `https://www.openstreetmap.org/${OSM_TYPES[ref[0] as keyof typeof OSM_TYPES]}/${ref.slice(1)}`;
}

/** "Q12345" → https://www.wikidata.org/wiki/Q12345 */
export function wikidataUrl(raw: string | undefined): string | null {
  const id = raw?.trim();
  return id && /^Q[0-9]{1,12}$/.test(id) ? `https://www.wikidata.org/wiki/${id}` : null;
}

/** "tr:Ankara Kalesi" → https://tr.wikipedia.org/wiki/Ankara_Kalesi */
export function wikipediaUrl(raw: string | undefined): string | null {
  const m = raw?.trim().match(/^([a-z]{2,3}(?:-[a-z]+)?):(.+)$/);
  return m ? `https://${m[1]}.wikipedia.org/wiki/${encodeURIComponent(m[2].trim().replace(/ /g, "_"))}` : null;
}

/** Yalnızca http(s) bağlantılar (OSM etiketleri kullanıcı girdisidir). */
export function safeUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

export const bboxArea = (b: BBox) => (b[2] - b[0]) * (b[3] - b[1]);

export function isValidBbox(b: unknown): b is BBox {
  return Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === "number" && Number.isFinite(v))
    && b[0] < b[2] && b[1] < b[3] && b[0] >= -180 && b[2] <= 180 && b[1] >= -90 && b[3] <= 90;
}

/** Harita sınırlarını geçerli aralığa sıkıştırır ve 3 ondalığa yuvarlar (istek anahtarı kararlı olsun). */
export function normalizeBbox(b: BBox): BBox {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [r(Math.max(-180, b[0])), r(Math.max(-90, b[1])), r(Math.min(180, b[2])), r(Math.min(90, b[3]))];
}

/** Bir noktanın çevresinde yaklaşık `radiusKm` yarıçaplı kutu. */
export function bboxAround(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  return normalizeBbox([center.lng - dLng, center.lat - dLat, center.lng + dLng, center.lat + dLat]);
}

/** "?konum=38.64,34.83,11" → { lat, lng, zoom } ; geçersizse null. */
export function parseKonum(raw: string | undefined | null): { lat: number; lng: number; zoom: number } | null {
  if (!raw) return null;
  const [lat, lng, zoom] = raw.split(",").map((s) => Number(s.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, zoom: Number.isFinite(zoom) ? Math.min(18, Math.max(3, zoom)) : 11 };
}
