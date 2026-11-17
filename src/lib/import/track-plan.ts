import { encodePolyline, haversine, projectOntoPolyline, simplifyToMaxPoints, type LatLng } from "@/lib/geo";
import { encodeTrack } from "@/lib/gps/track";
import { toLatLngs, trackStats, type ParsedTrack } from "./track";

/**
 * Ayrıştırılmış izden kaydedilecek özet (saf). Ham noktalar gönderilmez: yalnızca sadeleştirilmiş iz,
 * istatistikler ve duraklar (başlangıç, izin yakınındaki dosya yol noktaları, bitiş).
 */
export type ImportMode = "recording" | "route";
export type ImportStop = { name: string | null; lat: number; lng: number };
export type ImportPayload = {
  mode: ImportMode;
  polyline: string;
  distanceM: number;
  startedAt: string | null;
  endedAt: string | null;
  movingS: number | null;
  pointCount: number;
  /** İlk: başlangıç, son: bitiş. Adı null olan uç noktalar sunucuda adlandırılır. */
  stops: ImportStop[];
  /** Yalnızca rota modu: durak arası mesafe (m) ve tahmini süre (s) */
  legs: { d: number; s: number }[] | null;
};

/** Planlayıcı en fazla 20 durak kabul eder → 18 ara durak */
export const MAX_IMPORT_WAYPOINTS = 18;
/** Dosya yol noktası ize bu kadar yakınsa durak olur */
const WAYPOINT_NEAR_M = 1000;
/** Uç noktaya bu kadar yakın yol noktası onun adını verir */
const ENDPOINT_NAME_M = 300;
/** Zamansız rotalarda süre tahmini */
const PLAN_SPEED_MPS = 70 / 3.6;

export function buildImportPayload(track: ParsedTrack, mode: ImportMode): ImportPayload {
  const stats = trackStats(track.segments);
  if (mode === "recording" && !stats.hasTime) throw new Error("NO_TIME");
  const segments = toLatLngs(track.segments).filter((s) => s.length > 1);
  if (!segments.length) throw new Error("NO_TRACK");
  const path: LatLng[] = segments.flat();
  const start = path[0];
  const end = path[path.length - 1];

  const nameNear = (p: LatLng) => {
    let best: { name: string; d: number } | null = null;
    for (const w of track.waypoints) {
      const d = haversine(p, w);
      if (d <= ENDPOINT_NAME_M && (!best || d < best.d)) best = { name: w.name, d };
    }
    return best?.name ?? null;
  };

  // İzin yakınındaki yol noktaları, iz boyunca sırayla (uç noktalara çok yakın olanlar hariç)
  const coarse = path.length > 5000 ? simplifyToMaxPoints(path, 5000) : path;
  const total = projectOntoPolyline(end, coarse).alongDistance || 1;
  const mids = track.waypoints
    .map((w) => ({ w, pr: projectOntoPolyline(w, coarse) }))
    .filter(({ w, pr }) => pr.distance <= WAYPOINT_NEAR_M && haversine(w, start) > ENDPOINT_NAME_M && haversine(w, end) > ENDPOINT_NAME_M)
    .sort((a, b) => a.pr.alongDistance - b.pr.alongDistance)
    .slice(0, MAX_IMPORT_WAYPOINTS);

  const stops: ImportStop[] = [
    { name: nameNear(start), lat: start.lat, lng: start.lng },
    ...mids.map(({ w }) => ({ name: w.name, lat: w.lat, lng: w.lng })),
    { name: nameNear(end), lat: end.lat, lng: end.lng },
  ];

  if (mode === "recording") {
    return {
      mode,
      polyline: encodeTrack(segments),
      distanceM: stats.distanceM,
      startedAt: new Date(stats.startedAt!).toISOString(),
      endedAt: new Date(stats.endedAt!).toISOString(),
      movingS: stats.movingS,
      pointCount: stats.pointCount,
      stops,
      legs: null,
    };
  }

  // Rota: tek çizgi; bacaklar durakların iz üzerindeki konumlarından, ölçeklenmiş gerçek mesafeyle
  const scale = stats.distanceM / total;
  const along = [0, ...mids.map((m) => m.pr.alongDistance), total];
  const legs = along.slice(1).map((a, i) => {
    const d = Math.max(0, Math.round((a - along[i]) * scale));
    return { d, s: Math.round(d / PLAN_SPEED_MPS) };
  });
  return {
    mode,
    polyline: encodePolyline(simplifyToMaxPoints(path, 5000)),
    distanceM: stats.distanceM,
    startedAt: null,
    endedAt: null,
    movingS: null,
    pointCount: stats.pointCount,
    stops,
    legs,
  };
}
