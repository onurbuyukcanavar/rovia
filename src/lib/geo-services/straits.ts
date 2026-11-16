import type { LatLng } from "@/lib/geo";

/**
 * İstanbul ve Çanakkale boğaz köprüleri.
 *
 * Kullanıcı tercihi (ürün kararı): 15 Temmuz Şehitler Köprüsü, Fatih Sultan Mehmet Köprüsü ve
 * 1915 Çanakkale Köprüsü "ücretli yollardan kaçın" ve "otoyollardan kaçın" seçeneklerinde ücretli yol /
 * otoyol sayılmaz. Bu köprüler OSM'de hem ücretli hem otoyol (O-1, O-2, O-6) olarak işaretli olduğundan
 * Valhalla'nın kesin dışlaması onları da kapatıyor ve Trakya ile Anadolu arasında feribotsuz tek yol
 * Karadeniz'in çevresi kalıyordu (ör. Tekirdağ → Bursa 6.436 km). Köprü geçişi gerçekte ücretlidir;
 * arayüz bunu "köprü geçişi" notuyla belirtir.
 *
 * Yavuz Sultan Selim Köprüsü, Avrasya Tüneli, Osmangazi Köprüsü ve otoyollar bu istisnaya dahil değildir.
 */

export type Box = { minLat: number; maxLat: number; minLng: number; maxLng: number };
export type Bridge = {
  id: "15temmuz" | "fsm" | "canakkale1915";
  name: string;
  /** Avrupa (Trakya) yakasında, köprüye bağlanan otoyol olmayan yollar yakınında bir nokta */
  europe: LatLng;
  /** Anadolu yakasındaki karşılığı */
  anatolia: LatLng;
  /** Köprü ve bağlantı rampalarını kapsayan alan: tamamen bu alanda kalan ücretli/otoyol manevrası muaf */
  box: Box;
};

export const BRIDGES: Bridge[] = [
  {
    id: "15temmuz",
    name: "15 Temmuz Şehitler Köprüsü",
    europe: { lat: 41.0612, lng: 29.0058 },
    anatolia: { lat: 41.0228, lng: 29.0482 },
    box: { minLat: 40.985, maxLat: 41.075, minLng: 28.995, maxLng: 29.065 },
  },
  {
    id: "fsm",
    name: "Fatih Sultan Mehmet Köprüsü",
    europe: { lat: 41.0855, lng: 29.0290 },
    anatolia: { lat: 41.0925, lng: 29.0905 },
    box: { minLat: 41.065, maxLat: 41.120, minLng: 28.990, maxLng: 29.110 },
  },
  {
    id: "canakkale1915",
    name: "1915 Çanakkale Köprüsü",
    europe: { lat: 40.3735, lng: 26.6255 },
    anatolia: { lat: 40.3080, lng: 26.6760 },
    box: { minLat: 40.280, maxLat: 40.400, minLng: 26.560, maxLng: 26.720 },
  },
];

/** İstanbul metropol alanı: O-1 ve O-2 burada yalnızca köprülerde ücretlidir. */
const ISTANBUL: Box = { minLat: 40.8, maxLat: 41.35, minLng: 28.4, maxLng: 29.5 };

const inBox = (p: LatLng, b: Box) => p.lat >= b.minLat && p.lat <= b.maxLat && p.lng >= b.minLng && p.lng <= b.maxLng;

/** Kaçınma istisnasına girmeyen ücretli geçişler (yol adında geçerse muafiyet uygulanmaz). */
const NEVER_EXEMPT = /avrasya|yavuz sultan selim|osmangazi|\bO-?[34578]\b/i;

/**
 * Manevra köprü istisnasına giriyor mu? Muafsa köprünün adı döner.
 * - Otoyol için: manevra tamamen bir köprü alanında.
 * - Ücretli yol için ayrıca: İstanbul içinde O-1/O-2 (bu yollar yalnızca köprülerde ücretli).
 */
export function exemptBridge(
  from: LatLng, to: LatLng, names: string[], instruction: string, kind: "toll" | "highway",
): string | null {
  const text = `${names.join(" ")} ${instruction}`;
  // Yalnızca yol adlarına bakılır: yönlendirme tabelalarında başka geçişler de anılır ("Avrasya Tüneli/15 Temmuz…")
  if (NEVER_EXEMPT.test(names.join(" "))) return null;
  for (const b of BRIDGES) if (inBox(from, b.box) && inBox(to, b.box)) return b.name;
  if (kind === "toll" && inBox(from, ISTANBUL) && inBox(to, ISTANBUL) && /\bO-?[12]\b/i.test(names.join(" "))) {
    const named = BRIDGES.find((b) => text.includes(b.name.split(" ")[0]) && b.id !== "canakkale1915");
    return named?.name ?? (/\bO-?1\b/i.test(names.join(" ")) ? BRIDGES[0].name : BRIDGES[1].name);
  }
  return null;
}

// ---------------------------------------------------------------------------- Yaka (Avrupa / Anadolu)
/** Boğaz orta hattı (kuzeye doğru): [enlem, boylam] */
const BOSPHORUS: [number, number][] = [
  [40.99, 28.99], [41.012, 29.0], [41.03, 29.01], [41.045, 29.03], [41.065, 29.045], [41.085, 29.055],
  [41.11, 29.06], [41.13, 29.075], [41.16, 29.08], [41.185, 29.11], [41.21, 29.12], [41.24, 29.135],
];
/** Çanakkale Boğazı orta hattı (kuzeydoğuya doğru) */
const DARDANELLES: [number, number][] = [
  [40.03, 26.2], [40.1, 26.34], [40.15, 26.39], [40.2, 26.42], [40.27, 26.53], [40.33, 26.62],
  [40.37, 26.66], [40.4, 26.69], [40.44, 26.74], [40.47, 26.8],
];

function lineLngAt(line: [number, number][], lat: number) {
  if (lat <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [la0, lo0] = line[i - 1];
    const [la1, lo1] = line[i];
    if (lat <= la1) return lo0 + ((lat - la0) / (la1 - la0)) * (lo1 - lo0);
  }
  return line[line.length - 1][1];
}

/**
 * Nokta Avrupa yakasında (Trakya, Gelibolu Yarımadası) mı? Türkiye dışı ve adalar için kaba bir sınıflama;
 * yalnızca boğaz geçişi gerekip gerekmediğine karar vermek için kullanılır.
 */
export function isEuropeanSide(p: LatLng): boolean {
  if (p.lat < 39.9 || p.lat > 42.3 || p.lng > 29.6 || p.lng < 25.5) return false;
  // İstanbul Boğazı çevresi
  if (p.lat >= 40.95 && p.lng >= 28.6) return p.lat > 41.24 ? p.lng < 29.12 : p.lng < lineLngAt(BOSPHORUS, p.lat);
  // Gelibolu Yarımadası ve Çanakkale Boğazı
  if (p.lat < 40.47) return p.lng < lineLngAt(DARDANELLES, p.lat);
  // Trakya (Marmara'nın kuzeyi)
  return p.lng < 29.0 && (p.lat > 40.55 || p.lng < 27.0);
}

export const needsStraitCrossing = (a: LatLng, b: LatLng) => isEuropeanSide(a) !== isEuropeanSide(b);

function crow(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** İki nokta arasındaki geçiş için en kısa (kuş uçuşu) köprü; yön: from → to. */
export function chooseBridge(from: LatLng, to: LatLng): { bridge: Bridge; enter: LatLng; exit: LatLng } {
  const fromEurope = isEuropeanSide(from);
  let best: { bridge: Bridge; enter: LatLng; exit: LatLng; cost: number } | null = null;
  for (const b of BRIDGES) {
    const enter = fromEurope ? b.europe : b.anatolia;
    const exit = fromEurope ? b.anatolia : b.europe;
    const cost = crow(from, enter) + crow(exit, to);
    if (!best || cost < best.cost) best = { bridge: b, enter, exit, cost };
  }
  return best!;
}

/** Duraklar arası kuş uçuşu toplamı (km) */
export const crowKm = (points: LatLng[]) => points.slice(1).reduce((s, p, i) => s + crow(points[i], p), 0);
