import { haversine } from "@/lib/geo";

/** Tarayıcıdan gelen ham konum ölçümü. t: epoch milisaniye. */
export type RawPoint = {
  t: number;
  lat: number;
  lng: number;
  acc: number | null;
  alt?: number | null;
  spd?: number | null;
  hdg?: number | null;
};

export const GPS_FILTER = {
  /** Bundan kötü doğruluklu ölçümler atılır (m) */
  maxAccuracyM: 50,
  /** Bundan hızlı görünen sıçramalar atılır (m/s ≈ 252 km/sa) */
  maxSpeedMps: 70,
  /** Durağan titreşimi mesafeye eklememek için en küçük adım (m) */
  minStepM: 5,
  /** Hareket hâli eşiği (m/s ≈ 5 km/sa) */
  movingSpeedMps: 1.4,
  /** İki ölçüm arası bundan uzunsa kesinti sayılır (s) — örn. ekran kilidi, arka plan */
  gapS: 90,
  /** Sıçrama sanılan ama birbiriyle tutarlı bu kadar ölçüm gelirse konum gerçekten değişmiştir */
  relocateAfter: 3,
} as const;

export type PushResult =
  | { accepted: false; reason: "invalid" | "accuracy" | "time" | "jump" }
  | { accepted: true; distanceDelta: number; movingDelta: number; gap: boolean; relocated: boolean };

const valid = (p: RawPoint) =>
  Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

const ll = (p: RawPoint) => ({ lat: p.lat, lng: p.lng });

/**
 * Artımlı GPS filtresi. Ham noktaların mesafesini toplamak yerine:
 * - doğruluğu kötü, zamanı geriye giden ve fiziksel olarak imkânsız hızla sıçrayan ölçümleri atar,
 * - mesafeyi bir "çapa" noktasından en az minStepM (veya ölçüm doğruluğu) uzaklaşınca ekler
 *   (park hâlindeki titreşim kilometre biriktirmez),
 * - hareket süresini hız eşiğine göre ayırır.
 * Kayıt ekranı (canlı) ve sunucudaki özet hesabı aynı sınıfı kullanır.
 */
export class TrackFilter {
  private last: RawPoint | null = null;
  private anchor: RawPoint | null = null;
  private pending: RawPoint[] = [];
  distanceM = 0;
  movingS = 0;
  maxSpeedMps = 0;
  accepted = 0;

  /** Duraklatma sonrası yeni bölüm: önceki bölümün son noktasına mesafe eklenmez. */
  startSegment() {
    this.anchor = null;
    this.pending = [];
    this.recent = [];
    const keepTime = this.last?.t ?? null;
    this.last = null;
    this.lastTime = keepTime;
  }
  private lastTime: number | null = null;

  push(p: RawPoint): PushResult {
    if (!valid(p)) return { accepted: false, reason: "invalid" };
    if (p.acc !== null && p.acc !== undefined && (!Number.isFinite(p.acc) || p.acc > GPS_FILTER.maxAccuracyM)) {
      return { accepted: false, reason: "accuracy" };
    }
    const prevT = this.last?.t ?? this.lastTime;
    if (prevT !== null && p.t <= prevT) return { accepted: false, reason: "time" };

    const relocated = false;
    if (this.last) {
      const d = haversine(ll(this.last), ll(p));
      const dt = (p.t - this.last.t) / 1000;
      const tolerance = (p.acc ?? 0) + (this.last.acc ?? 0);
      if (d - tolerance > GPS_FILTER.maxSpeedMps * dt) {
        this.pending.push(p);
        if (this.pending.length >= GPS_FILTER.relocateAfter && this.pendingConsistent()) {
          // İlk konum (veya önceki nokta) hatalıymış: yeni konumdan devam et, aradaki mesafe sayılmaz
          const latest = this.pending[this.pending.length - 1];
          this.last = latest;
          this.anchor = latest;
          this.pending = [];
          this.recent = [latest];
          this.accepted += 1;
          return { accepted: true, distanceDelta: 0, movingDelta: 0, gap: true, relocated: true };
        }
        return { accepted: false, reason: "jump" };
      }
    }
    this.pending = [];

    let distanceDelta = 0;
    let movingDelta = 0;
    let gap = false;
    if (this.last && this.anchor) {
      const dt = (p.t - this.last.t) / 1000;
      gap = dt > GPS_FILTER.gapS;
      // İki ölçüm, doğruluk yarıçaplarının toplamı kadar ayrık olabilir: bunun altı titreşimdir
      const anchor = this.anchor;
      const fromAnchor = haversine(ll(anchor), ll(p));
      const threshold = Math.max(GPS_FILTER.minStepM, Math.min((anchor.acc ?? 0) + (p.acc ?? 0), 50));
      const advanced = fromAnchor >= threshold;
      if (advanced) {
        distanceDelta = fromAnchor;
        this.anchor = p;
      }
      const dtAnchor = (p.t - anchor.t) / 1000;
      const sensor = p.spd !== null && p.spd !== undefined && Number.isFinite(p.spd) && p.spd >= 0 ? p.spd : null;
      if (sensor !== null && dt < 10) {
        // Cihazın Doppler hızı konum farkından çok daha az gürültülüdür
        if (sensor >= GPS_FILTER.movingSpeedMps) movingDelta = dt;
      } else if (advanced) {
        // Hız yoksa: çapadan çapaya ilerleme hızı. Çapa aralıkları zamanı örtüşmeden böler.
        if (fromAnchor / dtAnchor >= GPS_FILTER.movingSpeedMps) movingDelta = dtAnchor;
      }
      // Azami hız: cihaz hızı; yoksa ~10 sn'lik pencerede ilerleme (kısa aralıkta titreşim hız gibi görünür)
      const forMax = sensor !== null && dt < 10 ? sensor : this.windowSpeed(p);
      if (!gap && forMax <= GPS_FILTER.maxSpeedMps) this.maxSpeedMps = Math.max(this.maxSpeedMps, forMax);
    } else {
      this.anchor = p;
    }

    this.last = p;
    this.recent.push(p);
    while (this.recent.length > 2 && p.t - this.recent[1].t >= 10_000) this.recent.shift();
    this.accepted += 1;
    this.distanceM += distanceDelta;
    this.movingS += movingDelta;
    return { accepted: true, distanceDelta, movingDelta, gap, relocated };
  }

  private recent: RawPoint[] = [];

  /** Son ~10 sn'deki ilerleme hızı (m/s); pencere 5 sn'den kısaysa 0. */
  private windowSpeed(p: RawPoint) {
    const first = this.recent[0];
    if (!first) return 0;
    const dt = (p.t - first.t) / 1000;
    if (dt < 5) return 0;
    const d = haversine(ll(first), ll(p)) - ((first.acc ?? 0) + (p.acc ?? 0)) / 2;
    return Math.max(0, d) / dt;
  }

  private pendingConsistent() {
    for (let i = 1; i < this.pending.length; i++) {
      const a = this.pending[i - 1];
      const b = this.pending[i];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) return false;
      const tolerance = (a.acc ?? 0) + (b.acc ?? 0);
      if (haversine(ll(a), ll(b)) - tolerance > GPS_FILTER.maxSpeedMps * dt) return false;
    }
    return true;
  }
}

export type SegmentInput = { startedAt: number; endedAt: number | null; points: RawPoint[] };

export type TrackSummary = {
  distanceM: number;
  elapsedS: number;
  movingS: number;
  /** Kullanıcının duraklattığı süre (bölümler arası) */
  pausedS: number;
  /** Duraklama süresi = toplam − hareket (trafik, mola ve duraklatma dahil) */
  stoppedS: number;
  averageKmh: number | null;
  maxKmh: number | null;
  pointCount: number;
  start: { lat: number; lng: number } | null;
  end: { lat: number; lng: number } | null;
  /** Filtreden geçen noktalar, bölüm bölüm (çizim için) */
  paths: { lat: number; lng: number }[][];
};

/** Tamamlanmış (ya da süren) bir kaydın özeti. Saat: ms epoch. */
export function summarizeTrack(segments: SegmentInput[], startedAt: number, endedAt: number): TrackSummary {
  const filter = new TrackFilter();
  const paths: { lat: number; lng: number }[][] = [];
  let activeS = 0;
  for (const seg of [...segments].sort((a, b) => a.startedAt - b.startedAt)) {
    filter.startSegment();
    const path: { lat: number; lng: number }[] = [];
    for (const p of [...seg.points].sort((a, b) => a.t - b.t)) {
      const r = filter.push(p);
      if (r.accepted) {
        // Kesinti veya konum düzeltmesinde çizgi bölünür (iki nokta arası düz çizgi yanıltıcı olur)
        if (r.relocated && path.length) {
          paths.push(path.splice(0));
        }
        path.push({ lat: p.lat, lng: p.lng });
      }
    }
    if (path.length) paths.push(path);
    const segEnd = seg.endedAt ?? endedAt;
    activeS += Math.max(0, (segEnd - seg.startedAt) / 1000);
  }

  const elapsedS = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const movingS = Math.min(elapsedS, Math.round(filter.movingS));
  const pausedS = Math.max(0, Math.min(elapsedS, Math.round(elapsedS - activeS)));
  const all = paths.flat();
  return {
    distanceM: Math.round(filter.distanceM * 10) / 10,
    elapsedS,
    movingS,
    pausedS,
    stoppedS: Math.max(0, elapsedS - movingS),
    averageKmh: movingS >= 30 && filter.distanceM > 0 ? round2((filter.distanceM / movingS) * 3.6) : null,
    maxKmh: filter.maxSpeedMps > 0 ? round2(filter.maxSpeedMps * 3.6) : null,
    pointCount: filter.accepted,
    start: all[0] ?? null,
    end: all[all.length - 1] ?? null,
    paths,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
