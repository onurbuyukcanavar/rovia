"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { LatLng } from "@/lib/geo";
import type { SyncResponse } from "@/lib/recordings/ops";
import { MAX_POINTS_PER_OP } from "@/lib/recordings/ops";
import { TrackFilter, type RawPoint } from "./filter";
import {
  addPoint, clearSession, countOutbox, deleteOutboxForRecording, deletePoints, enqueue, getPoints, getSession,
  outboxForRecording, putSession, type LocalSession,
} from "./local-store";
import { flushOutbox } from "./sync-client";
import { t } from "@/i18n";

export type RecorderPhase = "loading" | "idle" | "starting" | "recording" | "paused" | "finished";

export type RecorderStats = {
  distanceM: number;
  movingS: number;
  paths: LatLng[][];
};

export type SyncState = { pending: number; problem: "offline" | "retry" | "auth" | null; online: boolean };

/** Ham ölçümü cihazda saklama eşiği (filtre ayrıca 50 m üstünü yok sayar) */
const STORE_MAX_ACCURACY_M = 100;
/** Biriken noktalar bu aralıkla kuyruğa yazılır */
const ENQUEUE_EVERY_MS = 15_000;
const ENQUEUE_EVERY_POINTS = 60;
/** Bekleyen işlem varken gönderim aralığı */
const FLUSH_EVERY_MS = 10_000;
/** Bu kadar süre görünmez kalınırsa kullanıcı uyarılır */
const GAP_NOTICE_MS = 90_000;

const EMPTY_STATS: RecorderStats = { distanceM: 0, movingS: 0, paths: [] };

function geoErrorMessage(err: GeolocationPositionError | null) {
  if (!err) return null;
  if (err.code === err.PERMISSION_DENIED) return t.recording.permission.denied;
  if (err.code === err.POSITION_UNAVAILABLE) return t.recording.permission.unavailable;
  return null; // zaman aşımı: izleme sürer, yeni ölçüm bekleniyor
}

function toRaw(pos: GeolocationPosition): RawPoint {
  const c = pos.coords;
  return {
    t: Math.round(pos.timestamp),
    lat: c.latitude,
    lng: c.longitude,
    acc: Number.isFinite(c.accuracy) ? c.accuracy : null,
    alt: c.altitude ?? null,
    spd: c.speed ?? null,
    hdg: c.heading !== null && Number.isFinite(c.heading) ? c.heading : null,
  };
}

/**
 * GPS kaydedici. Kaynak gerçeği cihazdaki IndexedDB'dir: oturum, noktalar ve gönderilmemiş
 * işlemler orada tutulur; sunucu bağlantı oldukça sırayla güncellenir (çevrimdışı çalışır).
 */
export function useRecorder(userId: string) {
  const [phase, setPhase] = useState<RecorderPhase>("loading");
  const [session, setSession] = useState<LocalSession | null>(null);
  const [stats, setStats] = useState<RecorderStats>(EMPTY_STATS);
  const [lastFix, setLastFix] = useState<RawPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ pending: 0, problem: null, online: true });
  const [wakeLock, setWakeLock] = useState(false);
  const [finishedTripId, setFinishedTripId] = useState<string | null>(null);

  const sessionRef = useRef<LocalSession | null>(null);
  const filterRef = useRef(new TrackFilter());
  const pathsRef = useRef<LatLng[][]>([]);
  const bufferRef = useRef<RawPoint[]>([]);
  const lastEnqueueRef = useRef(0);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  /** Bitirilen kaydın kimliği: sunucu yanıtında yolculuk kimliği gelince özete gidilir */
  const finishingRef = useRef<string | null>(null);

  async function commitSession(next: LocalSession | null) {
    sessionRef.current = next;
    setSession(next);
    if (next) await putSession(next);
    else await clearSession(userId);
  }

  const publishStats = () => {
    const f = filterRef.current;
    setStats({ distanceM: f.distanceM, movingS: f.movingS, paths: pathsRef.current.map((p) => p.slice()) });
  };

  // ------------------------------------------------------------------ Senkron
  function handleSyncResponse(recordingId: string, res: SyncResponse) {
    const s = sessionRef.current;
    if (s && s.recordingId === recordingId) {
      if (res.tripId && s.tripId !== res.tripId) void commitSession({ ...s, tripId: res.tripId });
      if (res.error?.permanent && ["recording_not_found", "recording_closed", "recording_active", "trip_not_found", "trip_not_startable"].includes(res.error.code)) {
        // Kayıt sunucuda yok veya kapanmış: yerel kaydı sonlandır, kullanıcıya nedenini söyle
        void deletePoints(recordingId);
        void commitSession(null);
        resetTrack();
        setPhase("idle");
        setError(res.error.message);
      }
    }
    if (finishingRef.current === recordingId && res.status === "completed" && res.tripId) {
      finishingRef.current = null;
      setFinishedTripId(res.tripId);
    }
  }

  async function flush() {
    const r = await flushOutbox(userId, (id, res) => handleSyncResponse(id, res));
    setSync((s) => ({ ...s, pending: r.pending, problem: r.problem }));
    return r;
  }

  // ------------------------------------------------------------------ Noktalar
  async function enqueueBuffered() {
    const s = sessionRef.current;
    const buffer = bufferRef.current;
    if (!s || !buffer.length) return;
    bufferRef.current = [];
    lastEnqueueRef.current = Date.now();
    // Bölüm değiştiyse noktalar kendi bölümüne yazılır (s alanı saklanan noktada)
    const bySegment = new Map<string, RawPoint[]>();
    for (const p of buffer as (RawPoint & { s: string })[]) {
      const list = bySegment.get(p.s) ?? [];
      list.push({ t: p.t, lat: p.lat, lng: p.lng, acc: p.acc, alt: p.alt ?? null, spd: p.spd ?? null, hdg: p.hdg ?? null });
      bySegment.set(p.s, list);
    }
    for (const [segmentId, points] of bySegment) {
      for (let i = 0; i < points.length; i += MAX_POINTS_PER_OP) {
        await enqueue(userId, s.recordingId, { type: "points", segmentId, points: points.slice(i, i + MAX_POINTS_PER_OP) });
      }
    }
  }

  /** Yeni konum ölçümü: cihaza yazılır, filtreden geçer, belirli aralıkla gönderim kuyruğuna alınır. */
  function ingest(p: RawPoint) {
    setLastFix(p);
    setError(null);
    const s = sessionRef.current;
    if (!s || s.status !== "recording") return;
    const seg = s.segments[s.segments.length - 1];
    if (!seg || p.t < seg.startedAt - 5_000) return;
    if (p.acc !== null && p.acc > STORE_MAX_ACCURACY_M) return;

    const stored = { ...p, r: s.recordingId, s: seg.id };
    void addPoint(stored);
    bufferRef.current.push(stored);

    const r = filterRef.current.push(p);
    if (r.accepted) {
      const paths = pathsRef.current;
      if (!paths.length || r.relocated) paths.push([]);
      paths[paths.length - 1].push({ lat: p.lat, lng: p.lng });
      publishStats();
    }
    if (bufferRef.current.length >= ENQUEUE_EVERY_POINTS || Date.now() - lastEnqueueRef.current >= ENQUEUE_EVERY_MS) {
      void enqueueBuffered().then(() => (navigator.onLine ? flush() : undefined));
    }
  }

  // ------------------------------------------------------------------ Konum izleme (yalnızca kayıt sürerken)
  const watching = phase === "recording";
  const onPosition = useEffectEvent((pos: GeolocationPosition) => ingest(toRaw(pos)));
  const onGeoError = useEffectEvent((err: GeolocationPositionError) => {
    const msg = geoErrorMessage(err);
    if (msg) setError(msg);
  });
  const onWatchChange = useEffectEvent((active: boolean) => {
    if (active) void acquireWakeLock();
    else void releaseWakeLock();
  });

  useEffect(() => {
    if (!watching || !("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => onPosition(pos),
      (err) => onGeoError(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    onWatchChange(true);
    return () => {
      navigator.geolocation.clearWatch(id);
      onWatchChange(false);
    };
  }, [watching]);

  async function acquireWakeLock() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible" || wakeRef.current) return;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      wakeRef.current = sentinel;
      setWakeLock(true);
      sentinel.addEventListener("release", () => {
        wakeRef.current = null;
        setWakeLock(false);
      });
    } catch {
      setWakeLock(false); // pil tasarrufu modu vb.
    }
  }

  async function releaseWakeLock() {
    const s = wakeRef.current;
    wakeRef.current = null;
    setWakeLock(false);
    await s?.release().catch(() => undefined);
  }

  function resetTrack() {
    filterRef.current = new TrackFilter();
    pathsRef.current = [];
    bufferRef.current = [];
    setStats(EMPTY_STATS);
  }

  // ------------------------------------------------------------------ Kurtarma (sayfa açılışı)
  const restoreFrom = useEffectEvent(async (s: LocalSession | null, pending: number) => {
    setSync((x) => ({ ...x, pending }));
    if (!s) {
      setPhase("idle");
      return;
    }
    // Filtreyi cihazdaki noktalardan yeniden kur (aynı sonuç: aynı filtre, aynı sıra)
    const pts = await getPoints(s.recordingId);
    const filter = new TrackFilter();
    const paths: LatLng[][] = [];
    for (const seg of s.segments) {
      filter.startSegment();
      paths.push([]);
      for (const p of pts) {
        if (p.s !== seg.id) continue;
        const r = filter.push(p);
        if (r.accepted) {
          if (r.relocated) paths.push([]);
          paths[paths.length - 1].push({ lat: p.lat, lng: p.lng });
        }
      }
    }
    filterRef.current = filter;
    pathsRef.current = paths.filter((p) => p.length);
    sessionRef.current = s;
    setSession(s);
    publishStats();
    setPhase(s.status);
    setNotice(t.recording.recovered);
  });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getSession(userId), countOutbox(userId)]).then(([s, pending]) => {
      if (!cancelled) void restoreFrom(s, pending);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ------------------------------------------------------------------ Arka plan, bağlantı, düzenli gönderim
  const onVisibility = useEffectEvent(() => {
    if (document.visibilityState === "hidden") {
      hiddenAtRef.current = Date.now();
      return;
    }
    const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
    hiddenAtRef.current = null;
    if (sessionRef.current?.status === "recording") {
      void acquireWakeLock(); // Görünmez olunca tarayıcı kilidi bırakır
      if (hiddenFor >= GAP_NOTICE_MS) setNotice(t.recording.gapNotice(Math.round(hiddenFor / 60_000)));
    }
    void flush();
  });

  const onOnline = useEffectEvent(() => {
    setSync((s) => ({ ...s, online: navigator.onLine }));
    if (navigator.onLine) void flush();
  });

  const tick = useEffectEvent(() => {
    if (sessionRef.current?.status === "recording" && bufferRef.current.length && Date.now() - lastEnqueueRef.current >= ENQUEUE_EVERY_MS) {
      void enqueueBuffered();
    }
    if (navigator.onLine) void flush();
  });

  useEffect(() => {
    const vis = () => onVisibility();
    const net = () => onOnline();
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    const id = window.setInterval(() => tick(), FLUSH_EVERY_MS);
    net();
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
      window.clearInterval(id);
    };
  }, []);

  // ------------------------------------------------------------------ Eylemler
  async function start(opts: { plannedTripId: string | null; title: string }) {
      setError(null);
      setNotice(null);
      if (!window.isSecureContext) return setError(t.recording.permission.insecure);
      if (!("geolocation" in navigator)) return setError(t.recording.permission.unsupported);

      const startedAt = Date.now();
      setPhase("starting");
      // Konum izni kullanıcı dokunuşuyla istenir; ilk ölçüm (veya ret) gelene kadar kayıt açılmaz
      const first = await new Promise<GeolocationPosition | GeolocationPositionError>((resolve) =>
        navigator.geolocation.getCurrentPosition(resolve, resolve, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }),
      );
      if (!("coords" in first) && first.code === first.PERMISSION_DENIED) {
        setPhase("idle");
        return setError(t.recording.permission.denied);
      }

      const recordingId = crypto.randomUUID();
      const segmentId = crypto.randomUUID();
      resetTrack();
      await enqueue(userId, recordingId, { type: "start", segmentId, at: startedAt, tripId: opts.plannedTripId, title: opts.title });
      await commitSession({
        userId, recordingId, title: opts.title, plannedTripId: opts.plannedTripId, tripId: opts.plannedTripId,
        startedAt, status: "recording", segments: [{ id: segmentId, startedAt, endedAt: null }],
      });
      setPhase("recording");
      lastEnqueueRef.current = Date.now();
      if ("coords" in first) ingest(toRaw(first));
      void flush();
  }

  async function pause() {
    const s = sessionRef.current;
    if (!s || s.status !== "recording") return;
    const at = Date.now();
    await enqueueBuffered();
    const seg = s.segments[s.segments.length - 1];
    await enqueue(userId, s.recordingId, { type: "pause", segmentId: seg.id, at });
    await commitSession({ ...s, status: "paused", segments: s.segments.map((x) => (x.id === seg.id ? { ...x, endedAt: at } : x)) });
    setPhase("paused");
    void flush();
  }

  async function resume() {
    const s = sessionRef.current;
    if (!s || s.status !== "paused") return;
    const at = Date.now();
    const segmentId = crypto.randomUUID();
    await enqueue(userId, s.recordingId, { type: "resume", segmentId, at });
    filterRef.current.startSegment();
    pathsRef.current.push([]);
    await commitSession({ ...s, status: "recording", segments: [...s.segments, { id: segmentId, startedAt: at, endedAt: null }] });
    setPhase("recording");
    void flush();
  }

  async function finish() {
    const s = sessionRef.current;
    if (!s) return;
    await enqueueBuffered();
    await enqueue(userId, s.recordingId, { type: "finish", at: Date.now() });
    finishingRef.current = s.recordingId;
    await commitSession(null);
    await deletePoints(s.recordingId);
    setPhase("finished");
    const r = await flush();
    // Yolculuk kimliği zaten biliniyorsa ve her şey gönderildiyse doğrudan özete geç
    if (r.pending === 0 && finishingRef.current === s.recordingId && s.tripId) {
      finishingRef.current = null;
      setFinishedTripId(s.tripId);
    }
  }

  async function cancel() {
    const s = sessionRef.current;
    if (!s) return;
    bufferRef.current = [];
    const queued = await outboxForRecording(s.recordingId);
    if (queued.some((i) => i.op.type === "start")) {
      // Sunucuya hiç ulaşmamış kayıt: iz bırakmadan sil
      await deleteOutboxForRecording(s.recordingId);
    } else {
      await enqueue(userId, s.recordingId, { type: "cancel" });
    }
    await deletePoints(s.recordingId);
    await commitSession(null);
    resetTrack();
    setPhase("idle");
    void flush();
  }

  /** Başka cihazda başlamış (ya da yerel verisi silinmiş) aktif kaydı bu cihaza al. */
  async function adopt(remote: { recordingId: string; tripId: string; title: string; startedAt: number; status: "recording" | "paused"; openSegment: { id: string; startedAt: number } | null; points: { s: string; p: RawPoint }[] }) {
      const filter = new TrackFilter();
      const paths: LatLng[][] = [];
      let currentSeg: string | null = null;
      for (const { s, p } of remote.points) {
        if (s !== currentSeg) {
          filter.startSegment();
          paths.push([]);
          currentSeg = s;
        }
        if (filter.push(p).accepted) paths[paths.length - 1].push({ lat: p.lat, lng: p.lng });
      }
      filterRef.current = filter;
      pathsRef.current = paths.filter((x) => x.length);
      publishStats();
      const status = remote.openSegment ? "recording" : "paused";
      await commitSession({
        userId, recordingId: remote.recordingId, title: remote.title, plannedTripId: null, tripId: remote.tripId,
        startedAt: remote.startedAt, status,
        segments: remote.openSegment ? [{ id: remote.openSegment.id, startedAt: remote.openSegment.startedAt, endedAt: null }] : [],
      });
      setPhase(status);
      // Önceki cihazın son noktasından buraya mesafe eklenmez
      if (status === "recording") filter.startSegment();
  }

  return {
    phase, session, stats, lastFix, error, notice, sync, wakeLock, finishedTripId,
    start, pause, resume, finish, cancel, adopt, flush,
    dismissNotice: () => setNotice(null),
  };
}
