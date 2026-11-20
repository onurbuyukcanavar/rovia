#!/usr/bin/env node
/**
 * Ana sayfa parçacık sahnesi için Türkiye (batı) noktalarını üretir — çevrimdışı, bir kez çalıştırılır.
 *
 *   node scripts/gen-landing-points.mjs /yol/geo.js
 *
 * Girdi: `const GEO = { land, tr, city }` tanımlayan dosya (GEO.tr: projekte birimlerde SVG yolu).
 * Çıktı: src/components/landing/turkey-points.ts — iç dolgu + kıyı çizgisi noktaları (Uint16, base64)
 * ve rota üzerindeki şehirlerin koordinatları. Büyük SVG yolu uygulamaya gönderilmez.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(process.argv[2] ?? "geo.js", "utf8");
const GEO = new Function(`${src};return GEO`)();

// Yol → çokgenler (yalnızca M/L/Z)
const polys = [];
for (const m of GEO.tr.matchAll(/([MLZ])\s*(?:(-?[\d.]+)[ ,](-?[\d.]+))?/g)) {
  if (m[1] === "M") polys.push([[+m[2], +m[3]]]);
  else if (m[1] === "L") polys.at(-1).push([+m[2], +m[3]]);
}
const CLIP_X = 536; // kaynak yol bu x'te kırpılmış: kırpma kenarı çizgi olarak çizilmez

const inside = (x, y) => {
  let c = false;
  for (const p of polys)
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  return c;
};

// Deterministik rastgele (tekrar üretimde aynı çıktı)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const BOX = { x0: 0, y0: -25, x1: 540, y1: 615 };
const FILL = 2600, EDGE = 1900;

const fill = [];
while (fill.length < FILL) {
  const x = BOX.x0 + rnd() * (BOX.x1 - BOX.x0), y = BOX.y0 + rnd() * (BOX.y1 - BOX.y0);
  if (x < CLIP_X && inside(x, y)) fill.push([x, y]);
}

const segs = [];
let total = 0;
for (const p of polys)
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    if (a[0] >= CLIP_X - 0.5 && b[0] >= CLIP_X - 0.5) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) { segs.push([a, b, total, len]); total += len; }
  }
const edge = [];
for (let k = 0; k < EDGE; k++) {
  const d = ((k + rnd() * 0.5) / EDGE) * total;
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (segs[mid][2] <= d) lo = mid; else hi = mid - 1; }
  const [a, b, s0, len] = segs[lo], t = (d - s0) / len;
  edge.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}

const q = (v, lo, hi) => Math.round(((v - lo) / (hi - lo)) * 65535);
const arr = new Uint16Array((FILL + EDGE) * 2);
[...fill, ...edge].forEach(([x, y], i) => { arr[i * 2] = q(x, BOX.x0, BOX.x1); arr[i * 2 + 1] = q(y, BOX.y0, BOX.y1); });
const b64 = Buffer.from(arr.buffer).toString("base64");

const ROUTE = ["istanbul", "kartal", "gebze", "kopru", "yalova", "bursa", "susurluk", "balikesir", "soma", "bergama", "izmir", "torbali", "aydin", "cine", "mugla", "akyaka", "koycegiz", "dalaman", "gocek", "fethiye"];
const route = ROUTE.map((k) => GEO.city[k].map((v) => Math.round(v * 10) / 10));

const out = `// Otomatik üretildi: scripts/gen-landing-points.mjs — elle düzenlemeyin.
// Batı Türkiye (projekte birimler, kutu x ${BOX.x0}..${BOX.x1}, y ${BOX.y0}..${BOX.y1}): ${FILL} dolgu + ${EDGE} kıyı noktası, Uint16 çiftleri.
export const TR_BOX = ${JSON.stringify(BOX)} as const;
export const TR_FILL = ${FILL};
export const TR_EDGE = ${EDGE};
export const TR_POINTS_B64 =
  "${b64}";
/** İstanbul → Fethiye rotası (aynı projeksiyon) */
export const TR_ROUTE: ReadonlyArray<readonly [number, number]> = ${JSON.stringify(route)};
/** Rotada parlayan duraklar (TR_ROUTE dizinleri): İstanbul, Bursa, İzmir, Muğla, Fethiye */
export const TR_STOPS = [0, 5, 10, 14, 19] as const;
`;
const dest = path.join(path.dirname(new URL(import.meta.url).pathname), "../src/components/landing/turkey-points.ts");
writeFileSync(dest, out);
console.log(`yazıldı: ${dest} (${(out.length / 1024).toFixed(1)} KB)`);
