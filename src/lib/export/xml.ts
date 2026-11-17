/** XML 1.0 metin/öznitelik kaçışı; XML'de izin verilmeyen denetim karakterleri atılır. */
export function escapeXml(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDFFF]/g, (c, i: number, str: string) => {
      // Eşsiz (yalnız) vekil karakterleri at
      const code = c.charCodeAt(0);
      if (code <= 0xdbff) {
        const next = str.charCodeAt(i + 1);
        return next >= 0xdc00 && next <= 0xdfff ? c : "";
      }
      const prev = str.charCodeAt(i - 1);
      return prev >= 0xd800 && prev <= 0xdbff ? c : "";
    })
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Koordinat: en fazla 7 ondalık (≈1 cm), sondaki sıfırlar atılır */
export const coord = (n: number) => String(Math.round(n * 1e7) / 1e7);
export const isoTime = (t: number | string) => new Date(t).toISOString().replace(/\.000Z$/, "Z");

/** Dışa aktarma modeli: GPX ve KML aynı veriden üretilir. */
export type ExportPoint = { lat: number; lng: number; ele?: number | null; time?: number | string | null };
export type ExportWaypoint = { name: string; lat: number; lng: number; description?: string | null; time?: string | null; type?: string | null };
export type ExportDoc = {
  name: string;
  description?: string | null;
  /** Belge zamanı (metadata) */
  time?: string | null;
  /** Kaydedilen iz: bölümler */
  track?: { name: string; segments: ExportPoint[][] } | null;
  /** Planlanan rota (rtept / LineString) */
  route?: { name: string; points: ExportPoint[] } | null;
  waypoints: ExportWaypoint[];
};
