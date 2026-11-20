/**
 * Ana sayfa harita sahnesi için yer adı içermeyen, temsilî bir arazi haritası üretir:
 * eş yükselti eğrileriyle tepeler, soluk bir harita dokusu ve aralarından kıvrılarak geçen bir rota.
 * Belirli bir ülke ya da şehir göstermez; her yolculuğa uyacak genel bir "yol haritası"dır.
 * Birimler: x 0..540, y -25..615 (y aşağı doğru), ana sahnedeki dönüşümle uyumlu.
 */

type Pt = [number, number];

export type MapPoints = {
  fill: Pt[];
  edge: Pt[];
  route: ReadonlyArray<readonly [number, number]>;
  stops: readonly number[];
};

/** Rota kontrol noktaları: sol alttan sağ üste, tepelerin arasından kıvrılan bir yol. */
export const MAP_ROUTE: ReadonlyArray<readonly [number, number]> = [
  [92, 548], [138, 520], [176, 470], [168, 418], [205, 372], [262, 360],
  [300, 318], [288, 262], [318, 214], [372, 196], [404, 148], [398, 96], [440, 52],
];
/** Rotada parlayan duraklar (MAP_ROUTE dizinleri): başlangıç, üç mola, varış */
export const MAP_STOPS = [0, 3, 6, 9, 12] as const;

/** Tepeler: merkez, en dış yarıçap, halka sayısı, biçim tohumu */
const HILLS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [118, 300, 96, 5, 1.3],
  [392, 362, 118, 6, 2.1],
  [218, 130, 84, 4, 3.7],
  [470, 520, 70, 4, 0.6],
  [272, 520, 52, 3, 4.4],
  [60, 92, 58, 3, 5.2],
];

export function generateMap(rnd: () => number): MapPoints {
  // Eş yükselti eğrileri: düzensiz halkalar, uzunluklarıyla orantılı nokta
  const rings: { cx: number; cy: number; r: number; a: number; b: number }[] = [];
  for (const [cx, cy, R, n, s] of HILLS)
    for (let k = 1; k <= n; k++) rings.push({ cx, cy, r: (R * k) / n, a: s, b: s * 1.7 + k * 0.3 });
  const ringAt = (g: (typeof rings)[number], th: number): Pt => {
    const rr = g.r * (1 + 0.16 * Math.sin(3 * th + g.a) + 0.08 * Math.sin(5 * th + g.b));
    return [g.cx + Math.cos(th) * rr, g.cy + Math.sin(th) * rr * 0.86];
  };
  const totalR = rings.reduce((s, g) => s + g.r, 0);
  const edge: Pt[] = [];
  const EDGE = 1900;
  for (const g of rings) {
    const m = Math.round((g.r / totalR) * EDGE);
    for (let j = 0; j < m; j++) edge.push(ringAt(g, ((j + rnd() * 0.6) / m) * Math.PI * 2));
  }

  // Harita dokusu: kenarlara doğru seyrelen, hafif ızgaraya oturmuş noktalar
  const fill: Pt[] = [];
  const FILL = 2600;
  while (fill.length < FILL) {
    const x = rnd() * 540, y = -25 + rnd() * 640;
    const dx = (x - 270) / 290, dy = (y - 295) / 340, d = dx * dx + dy * dy;
    if (d > 1 || rnd() < d * 0.9) continue;
    const snap = rnd() < 0.35; // bazıları ince bir enlem/boylam ızgarasına otursun
    fill.push(snap ? (rnd() < 0.5 ? [Math.round(x / 60) * 60, y] : [x, Math.round(y / 60) * 60]) : [x, y]);
  }

  return { fill, edge, route: MAP_ROUTE, stops: MAP_STOPS };
}
