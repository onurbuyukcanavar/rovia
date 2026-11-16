/**
 * Coğrafi yardımcılar — saf TypeScript, tarayıcı ve sunucuda aynı şekilde çalışır.
 * Google'ın encoded polyline algoritması: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function isValidLatLng(p: unknown): p is LatLng {
  if (!p || typeof p !== "object") return false;
  const { lat, lng } = p as LatLng;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** İki nokta arasındaki büyük çember mesafesi (metre). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("INVALID_POLYLINE");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

export function encodePolyline(points: LatLng[], precision = 5): string {
  const factor = 10 ** precision;
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    encodeValue(lat - prevLat);
    encodeValue(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

/**
 * Bir noktanın, iki noktadan oluşan doğru parçasına en kısa uzaklığı.
 * Kısa mesafelerde (≤ yüzlerce km) yerel düzlem yaklaşımı yeterince doğrudur.
 * `t` ∈ [0,1]: en yakın noktanın parça üzerindeki konumu.
 */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): { distance: number; t: number } {
  const refLat = toRad((a.lat + b.lat + p.lat) / 3);
  const kx = Math.cos(refLat) * toRad(1) * EARTH_RADIUS_M;
  const ky = toRad(1) * EARTH_RADIUS_M;
  const ax = a.lng * kx, ay = a.lat * ky;
  const bx = b.lng * kx, by = b.lat * ky;
  const px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { distance: Math.hypot(px - cx, py - cy), t };
}

export type PolylineProjection = {
  /** Noktanın rotaya en kısa uzaklığı (m) */
  distance: number;
  /** En yakın parçanın başlangıç indeksi */
  segmentIndex: number;
  /** Rotanın başından en yakın noktaya kadar olan yol (m) */
  alongDistance: number;
};

/** Noktayı rota üzerine iz düşürür: rotaya uzaklık ve rota boyunca konum. */
export function projectOntoPolyline(p: LatLng, path: LatLng[]): PolylineProjection {
  if (path.length === 0) throw new Error("EMPTY_PATH");
  if (path.length === 1) return { distance: haversine(p, path[0]), segmentIndex: 0, alongDistance: 0 };

  let best: PolylineProjection = { distance: Infinity, segmentIndex: 0, alongDistance: 0 };
  let cumulative = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const segLen = haversine(path[i], path[i + 1]);
    const { distance, t } = distanceToSegment(p, path[i], path[i + 1]);
    if (distance < best.distance) best = { distance, segmentIndex: i, alongDistance: cumulative + t * segLen };
    cumulative += segLen;
  }
  return best;
}

export function polylineLength(path: LatLng[]): number {
  let sum = 0;
  for (let i = 0; i < path.length - 1; i++) sum += haversine(path[i], path[i + 1]);
  return sum;
}

/**
 * Rotaya yeni bir durak eklenecekse hangi ara durak sırasına girmesi gerektiğini bulur.
 * Bacak (leg) uzunlukları verilir; yerin rota boyunca konumu hangi bacağa düşüyorsa
 * o bacağın sonuna (yani sonraki duraktan önce) eklenir.
 * Dönen değer `intermediates` dizisine ekleme indeksidir (0 = ilk ara durak olarak).
 */
export function insertionIndexForLegs(alongDistance: number, legDistances: number[]): number {
  let cumulative = 0;
  for (let i = 0; i < legDistances.length; i++) {
    cumulative += legDistances[i];
    if (alongDistance <= cumulative) return i;
  }
  return Math.max(0, legDistances.length - 1);
}

/** Bir sınır kutusu (viewport) içine giren noktalar için kutu hesaplar. */
export function boundsOf(points: LatLng[]) {
  if (!points.length) return null;
  let north = -90, south = 90, east = -180, west = 180;
  for (const p of points) {
    north = Math.max(north, p.lat);
    south = Math.min(south, p.lat);
    east = Math.max(east, p.lng);
    west = Math.min(west, p.lng);
  }
  return { north, south, east, west };
}
