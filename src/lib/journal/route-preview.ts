import { decodeTrack } from "@/lib/gps/track";

/**
 * Rota önizlemesi için SVG yolu (harita karosu gerekmez; arşiv listesinde hızlı ve ücretsiz).
 * Enlem/boylam eşdikdörtgen izdüşümle (boylam cos(enlem) ile ölçeklenir) kutuya sığdırılır.
 */
export function routePreviewPath(polyline: string | null, width = 160, height = 96, pad = 8): { d: string; start: [number, number]; end: [number, number] } | null {
  const segs = decodeTrack(polyline).filter((s) => s.length > 1);
  const pts = segs.flat();
  if (pts.length < 2) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const k = Math.cos(((pts.reduce((a, p) => a + p.lat, 0) / pts.length) * Math.PI) / 180);
  for (const p of pts) {
    const x = p.lng * k;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, p.lat); maxY = Math.max(maxY, p.lat);
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const proj = (lat: number, lng: number): [number, number] => [
    +(offX + (lng * k - minX) * scale).toFixed(1),
    +(offY + (maxY - lat) * scale).toFixed(1),
  ];
  // Uzun izlerde çizim yükünü azalt: segment başına en fazla ~300 nokta
  const d = segs.map((s) => {
    const step = Math.max(1, Math.floor(s.length / 300));
    const sampled = s.filter((_, i) => i % step === 0 || i === s.length - 1);
    return sampled.map((p, i) => `${i ? "L" : "M"}${proj(p.lat, p.lng).join(" ")}`).join("");
  }).join("");
  const first = pts[0];
  const last = pts[pts.length - 1];
  return { d, start: proj(first.lat, first.lng), end: proj(last.lat, last.lng) };
}
