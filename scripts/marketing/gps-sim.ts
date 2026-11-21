/**
 * Gerçekçi GPS izi benzetimi (seed-demo.ts): rota çizgisi boyunca 5 sn aralıklı ölçümler,
 * duraklarda 20 sn aralıklı durağan ölçümler. Tekrarlanabilir (sabit tohumlu rastgelelik).
 */
import { haversine, type LatLng } from "@/lib/geo";

/** Rota çizgisini duraklara göre bacaklara böler (her durağa en yakın köşe, ileri doğru arama). */
export function splitLegs(path: LatLng[], stops: LatLng[]): LatLng[][] {
  const cuts = [0];
  for (const s of stops.slice(1, -1)) {
    let best = cuts[cuts.length - 1];
    let bestD = Infinity;
    for (let i = best; i < path.length; i++) {
      const d = haversine(path[i], s);
      if (d < bestD) { bestD = d; best = i; }
    }
    cuts.push(best);
  }
  cuts.push(path.length - 1);
  return cuts.slice(1).map((end, i) => path.slice(cuts[i], end + 1));
}

export type Pt = { t: number; lat: number; lng: number; acc: number; spd: number; hdg: number | null };

/** Tekrarlanabilir rastgelelik (her çalıştırmada aynı iz). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const rand = rng(20261031);
const between = (a: number, b: number) => a + (b - a) * rand();

function bearing(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Metre cinsinden küçük sapma (GPS gürültüsü). */
function jitter(p: LatLng, meters: number): LatLng {
  const dLat = (between(-1, 1) * meters) / 111_320;
  const dLng = (between(-1, 1) * meters) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/** Durağan bekleme: 20 sn'de bir, hız 0. */
export function dwell(out: Pt[], at: LatLng, startMs: number, minutes: number): number {
  const end = startMs + minutes * 60_000;
  let t = startMs;
  while (t < end) {
    t += 20_000;
    const p = jitter(at, 3);
    out.push({ t, lat: p.lat, lng: p.lng, acc: Math.round(between(5, 12)), spd: 0, hdg: null });
  }
  return end;
}

/**
 * Bir bacağı sürer: Valhalla süresine yakın tempo, şehir giriş/çıkışında yavaşlama, düzgün hız dalgalanması.
 * rests: bacağın şu oranında (0..1) dakika cinsinden mola. Dönen değer: varış zamanı ve mola konumları.
 */
export function drive(out: Pt[], path: LatLng[], legSeconds: number, startMs: number, rests: { at: number; minutes: number }[] = []) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  const total = cum[cum.length - 1];
  const avg = total / Math.max(1, legSeconds * between(0.98, 1.06));
  const restQueue = [...rests].sort((a, b) => a.at - b.at);
  const restPoints: { at: LatLng; startMs: number; endMs: number }[] = [];
  let s = 0;
  let t = startMs;
  let idx = 0;
  let phase = between(0, 6);
  const pos = (dist: number): { p: LatLng; seg: number } => {
    while (idx < cum.length - 2 && cum[idx + 1] < dist) idx++;
    const segLen = cum[idx + 1] - cum[idx] || 1;
    const f = Math.min(1, Math.max(0, (dist - cum[idx]) / segLen));
    const a = path[idx];
    const b = path[idx + 1] ?? a;
    return { p: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, seg: idx };
  };
  while (s < total) {
    const urban = Math.min(1, Math.min(s, total - s) / 6_000);
    phase += 0.004 + rand() * 0.004;
    const wave = 1 + 0.13 * Math.sin(phase) + 0.05 * Math.sin(phase * 3.7);
    const v = Math.min(34, Math.max(3.5, avg * (0.5 + 0.55 * urban) * wave * 1.04));
    s = Math.min(total, s + v * 5);
    t += 5_000;
    const { p, seg } = pos(s);
    const q = jitter(p, 2.5);
    const hdg = bearing(path[seg], path[seg + 1] ?? path[seg]);
    out.push({ t, lat: q.lat, lng: q.lng, acc: Math.round(between(3, 9)), spd: Math.max(0, v + between(-0.6, 0.6)), hdg: Math.round(hdg) % 360 });
    if (restQueue.length && s >= restQueue[0].at * total) {
      const r = restQueue.shift()!;
      const endMs = dwell(out, p, t, r.minutes);
      restPoints.push({ at: p, startMs: t, endMs });
      t = endMs;
    }
  }
  return { arrivalMs: t, restPoints };
}
