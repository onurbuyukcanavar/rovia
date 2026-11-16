import { describe, expect, it } from "vitest";
import { GPS_FILTER, TrackFilter, summarizeTrack, type RawPoint } from "./filter";

const T0 = Date.UTC(2026, 10, 16, 9, 0, 0);
const M_PER_DEG_LAT = 111_195;

/** Kuzeye sabit hızla giden araç; deterministik "gürültü" ile. */
function drive(opts: { from?: { lat: number; lng: number }; seconds: number; speedMps: number; t0?: number; noiseM?: number; acc?: number }) {
  const from = opts.from ?? { lat: 40, lng: 30 };
  const pts: RawPoint[] = [];
  for (let s = 0; s <= opts.seconds; s++) {
    const noise = (opts.noiseM ?? 0) * Math.sin(s * 1.7);
    pts.push({
      t: (opts.t0 ?? T0) + s * 1000,
      lat: from.lat + (s * opts.speedMps + noise) / M_PER_DEG_LAT,
      lng: from.lng,
      acc: opts.acc ?? 8,
      spd: opts.speedMps,
    });
  }
  return pts;
}

/** Park hâli: aynı yerde, doğruluk içinde titreşen ölçümler. */
function parked(seconds: number, t0: number, at = { lat: 40, lng: 30 }, jitterM = 6) {
  return Array.from({ length: seconds + 1 }, (_, s): RawPoint => ({
    t: t0 + s * 1000,
    lat: at.lat + (jitterM * Math.sin(s * 2.3)) / M_PER_DEG_LAT,
    lng: at.lng + (jitterM * Math.cos(s * 1.1)) / (M_PER_DEG_LAT * Math.cos((at.lat * Math.PI) / 180)),
    acc: 12,
    spd: 0,
  }));
}

describe("TrackFilter", () => {
  it("düz yolda mesafeyi doğru toplar (90 km/sa, 10 dk ≈ 15 km)", () => {
    const f = new TrackFilter();
    for (const p of drive({ seconds: 600, speedMps: 25, noiseM: 3 })) f.push(p);
    expect(f.distanceM).toBeGreaterThan(14_900);
    expect(f.distanceM).toBeLessThan(15_100);
    expect(f.movingS).toBe(600);
    expect(f.maxSpeedMps).toBeGreaterThan(24);
    expect(f.maxSpeedMps).toBeLessThan(27);
  });

  it("park hâlindeki titreşim mesafe ve hareket süresi biriktirmez", () => {
    const f = new TrackFilter();
    for (const p of parked(1800, T0)) f.push(p); // 30 dk
    expect(f.distanceM).toBeLessThan(60);
    expect(f.movingS).toBe(0);
  });

  it("hız bildirmeyen cihazda da (masaüstü, bazı tarayıcılar) park titreşimi hareket sayılmaz; sürüş sayılır", () => {
    const f = new TrackFilter();
    for (const p of parked(600, T0)) f.push({ ...p, spd: null });
    expect(f.movingS).toBe(0);
    expect(f.maxSpeedMps * 3.6).toBeLessThan(10);
    for (const p of drive({ seconds: 300, speedMps: 15, t0: T0 + 601_000 })) f.push({ ...p, spd: null });
    expect(f.movingS).toBeGreaterThan(290);
    expect(f.distanceM).toBeGreaterThan(4_350);
    expect(f.distanceM).toBeLessThan(4_700);
    expect(f.maxSpeedMps).toBeGreaterThan(13);
    expect(f.maxSpeedMps).toBeLessThan(17);
  });

  it("doğruluğu kötü, zamanı geriye giden ve geçersiz ölçümleri atar", () => {
    const f = new TrackFilter();
    expect(f.push({ t: T0, lat: 40, lng: 30, acc: 8 }).accepted).toBe(true);
    expect(f.push({ t: T0 + 1000, lat: 40.0002, lng: 30, acc: 120 })).toEqual({ accepted: false, reason: "accuracy" });
    expect(f.push({ t: T0, lat: 40.0002, lng: 30, acc: 8 })).toEqual({ accepted: false, reason: "time" });
    expect(f.push({ t: T0 + 2000, lat: Number.NaN, lng: 30, acc: 8 })).toEqual({ accepted: false, reason: "invalid" });
    expect(f.push({ t: T0 + 2000, lat: 0, lng: 0, acc: 8 })).toEqual({ accepted: false, reason: "invalid" });
  });

  it("tek seferlik konum sıçramasını atar ve mesafeye eklemez", () => {
    const f = new TrackFilter();
    const pts = drive({ seconds: 120, speedMps: 20 });
    pts.splice(60, 1, { ...pts[60], lat: pts[60].lat + 0.05 }); // 5,5 km'lik sahte sıçrama
    const rejected = pts.map((p) => f.push(p)).filter((r) => !r.accepted);
    expect(rejected).toEqual([{ accepted: false, reason: "jump" }]);
    expect(f.distanceM).toBeGreaterThan(2_350);
    expect(f.distanceM).toBeLessThan(2_450);
  });

  it("ilk ölçüm hatalıysa tutarlı yeni konumlara geçer (kalıcı kilitlenme olmaz)", () => {
    const f = new TrackFilter();
    f.push({ t: T0, lat: 41, lng: 29, acc: 30 }); // Hatalı ilk konum (Wi-Fi tahmini, 100+ km uzakta)
    const results = drive({ seconds: 30, speedMps: 15, t0: T0 + 1000 }).map((p) => f.push(p));
    expect(results.some((r) => r.accepted && r.relocated)).toBe(true);
    expect(results.slice(-5).every((r) => r.accepted)).toBe(true);
    expect(f.distanceM).toBeLessThan(500); // Sahte 100 km eklenmedi
  });

  it("uzun kesintiyi (ekran kilidi) işaretler ama aradaki yolu sayar", () => {
    const f = new TrackFilter();
    for (const p of drive({ seconds: 10, speedMps: 20 })) f.push(p);
    const after = f.push({ t: T0 + 10_000 + 300_000, lat: 40 + (200 + 6000) / M_PER_DEG_LAT, lng: 30, acc: 8, spd: 20 });
    expect(after).toMatchObject({ accepted: true, gap: true });
    expect(f.distanceM).toBeGreaterThan(6_150);
  });

  it("yeni bölümde (duraklatma sonrası) önceki bölüme mesafe eklenmez", () => {
    const f = new TrackFilter();
    for (const p of drive({ seconds: 60, speedMps: 20 })) f.push(p);
    const before = f.distanceM;
    f.startSegment();
    // Duraklatmadayken 10 km gidilmiş; yeni bölüm orada başlıyor
    for (const p of drive({ from: { lat: 40.2, lng: 30 }, seconds: 60, speedMps: 20, t0: T0 + 1_000_000 })) f.push(p);
    expect(f.distanceM - before).toBeGreaterThan(1_150);
    expect(f.distanceM - before).toBeLessThan(1_250);
  });
});

describe("summarizeTrack", () => {
  it("toplam, hareket, duraklatma ve duraklama sürelerini ayırır; ortalama hız hareket süresine göre", () => {
    // 0–600 s sürüş, 600–900 s park (kayıt sürüyor), 900–1200 duraklatıldı, 1200–1800 sürüş
    const seg1 = [...drive({ seconds: 600, speedMps: 25 }), ...parked(299, T0 + 601_000, { lat: 40 + 15_000 / M_PER_DEG_LAT, lng: 30 }, 4)];
    const seg2 = drive({ from: { lat: 40.3, lng: 30 }, seconds: 600, speedMps: 25, t0: T0 + 1_200_000 });
    const s = summarizeTrack(
      [
        { startedAt: T0, endedAt: T0 + 900_000, points: seg1 },
        { startedAt: T0 + 1_200_000, endedAt: T0 + 1_800_000, points: seg2 },
      ],
      T0,
      T0 + 1_800_000,
    );
    expect(s.elapsedS).toBe(1800);
    expect(s.pausedS).toBe(300);
    expect(s.movingS).toBeGreaterThanOrEqual(1199);
    expect(s.movingS).toBeLessThanOrEqual(1201);
    expect(s.stoppedS).toBe(1800 - s.movingS);
    expect(s.distanceM).toBeGreaterThan(29_800);
    expect(s.distanceM).toBeLessThan(30_200);
    expect(s.averageKmh).toBeGreaterThan(89);
    expect(s.averageKmh).toBeLessThan(91);
    expect(s.paths).toHaveLength(2);
    expect(s.start).toEqual({ lat: 40, lng: 30 });
    expect(s.end?.lat).toBeCloseTo(40.3 + 15_000 / M_PER_DEG_LAT, 6);
  });

  it("noktasız kayıt: sıfır mesafe, hız yok", () => {
    const s = summarizeTrack([{ startedAt: T0, endedAt: T0 + 60_000, points: [] }], T0, T0 + 60_000);
    expect(s).toMatchObject({ distanceM: 0, elapsedS: 60, movingS: 0, averageKmh: null, maxKmh: null, start: null, pointCount: 0 });
  });

  it("filtre sabitleri makul aralıkta (yanlışlıkla değiştirilmesin)", () => {
    expect(GPS_FILTER.maxSpeedMps * 3.6).toBeGreaterThan(200);
    expect(GPS_FILTER.movingSpeedMps * 3.6).toBeLessThan(6);
  });
});
