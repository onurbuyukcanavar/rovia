import "server-only";
import { decodePolyline, encodePolyline, type LatLng } from "@/lib/geo";
import type { RouteOptions, RouteStep, StepKind } from "@/lib/maps/types";
import { GeoError } from "./errors";
import { fetchJson } from "./http";

/**
 * Valhalla rota motoru (MIT, https://github.com/valhalla/valhalla).
 * Varsayılan: FOSSGIS'in herkese açık sunucusu (en fazla 1 istek/sn, erişilebilirlik garantisi yok).
 * Kendi sunucumuza geçmek için yalnızca VALHALLA_URL değiştirilir (docs/SETUP.md).
 */
export const valhallaUrl = () => (process.env.VALHALLA_URL || "https://valhalla1.openstreetmap.de").replace(/\/$/, "");

/** Herkese açık sunucunun konum sınırı 20; ROVIA en fazla 18 ara durağa izin verir. */
export const MAX_INTERMEDIATES = 18;
const MAX_STEPS = 400;
const MAX_ROUTES = 3;

export type ComputedRoute = {
  distanceMeters: number;
  durationSeconds: number;
  /** Google uyumlu polyline (precision 5) — istemci ve veritabanı aynı biçimi kullanır */
  encodedPolyline: string;
  legs: { distanceMeters: number; durationSeconds: number }[];
  /** Ücretli yol/köprü/otoyol. Feribot ücreti burada sayılmaz (hasFerry ayrı). */
  hasToll: boolean;
  hasFerry: boolean;
  hasHighway: boolean;
  steps: RouteStep[];
};

export type RouteResponse = { routes: ComputedRoute[]; alternativesSupported: boolean };

type VManeuver = {
  type: number; instruction?: string; length: number; time: number; begin_shape_index: number;
  toll?: boolean; ferry?: boolean; highway?: boolean;
};
type VTrip = {
  legs?: { shape: string; summary: { length: number; time: number }; maneuvers?: VManeuver[] }[];
  summary?: { length: number; time: number; has_toll?: boolean; has_ferry?: boolean; has_highway?: boolean };
};
type VResponse = { trip?: VTrip; alternates?: { trip: VTrip }[]; error_code?: number; error?: string; status_code?: number };

/**
 * Valhalla "auto" seçenekleri.
 * - Feribotlar varsayılan olarak cezasız (use_ferry=1): Eskihisar–Topçular gibi gerçek seçenekler rota/alternatif olur.
 * - Kaçınma seçenekleri kesin dışlamadır (exclude_*), Google Maps'teki "... kaçın" davranışı gibi.
 * - tollMode "soft": ücretli yolları güçlü biçimde cezalandır ama feribotu (OSM'de toll=yes) dışlama.
 */
function costing(options: RouteOptions, tollMode: "none" | "exclude" | "soft") {
  const auto: Record<string, unknown> = {};
  if (options.avoidFerries) auto.exclude_ferries = true;
  else auto.use_ferry = 1;
  if (options.avoidHighways) auto.exclude_highways = true;
  if (tollMode === "exclude") auto.exclude_tolls = true;
  if (tollMode === "soft") auto.use_tolls = 0;
  return { auto };
}

export function buildRouteRequest(points: LatLng[], alternatives: boolean, options: RouteOptions = NO_OPTIONS, tollMode: "none" | "exclude" | "soft" = "none") {
  if (points.length < 2) throw new GeoError("invalid_request", "need ≥2 points");
  if (points.length > MAX_INTERMEDIATES + 2) throw new GeoError("invalid_request", "too many points");
  return {
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
    costing: "auto",
    costing_options: costing(options, tollMode),
    units: "kilometers",
    language: "tr-TR",
    // "instructions": manevralar + Türkçe anlatım ("maneuvers" anlatımı içermez)
    directions_type: "instructions",
    // Valhalla alternatifleri yalnızca iki noktalı isteklerde hesaplar
    ...(alternatives && points.length === 2 ? { alternates: 2 } : {}),
  };
}

const NO_OPTIONS: RouteOptions = { avoidTolls: false, avoidHighways: false, avoidFerries: false };

/** Valhalla manevra türü → simge türü (https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/) */
export function stepKind(type: number): StepKind {
  if (type >= 1 && type <= 3) return "depart";
  if (type >= 4 && type <= 6) return "arrive";
  if (type === 28 || type === 29) return "ferry";
  if (type === 26 || type === 27) return "roundabout";
  if (type === 12 || type === 13) return "uturn";
  if ([9, 10, 11, 20, 23].includes(type)) return "right";
  if ([14, 15, 16, 21, 24].includes(type)) return "left";
  if ([17, 18, 19].includes(type)) return "ramp";
  if ([25, 37, 38].includes(type)) return "merge";
  return "straight";
}

export function toRoute(trip: VTrip): ComputedRoute {
  const legs = trip.legs ?? [];
  if (!legs.length || !trip.summary) throw new GeoError("upstream", "trip without legs");
  const path: LatLng[] = [];
  const steps: RouteStep[] = [];
  let roadToll = false;
  let ferry = Boolean(trip.summary.has_ferry);
  let sawManeuvers = false;
  legs.forEach((leg, li) => {
    const pts = decodePolyline(leg.shape, 6);
    // Bacaklar uç uca eklenir; ortak noktayı tekrar ekleme
    path.push(...(path.length ? pts.slice(1) : pts));
    for (const m of leg.maneuvers ?? []) {
      sawManeuvers = true;
      const isFerry = Boolean(m.ferry) || m.type === 28;
      if (isFerry) ferry = true;
      if (m.toll && !isFerry) roadToll = true;
      // Ara durağa varış/çıkış manevraları tekrar etmesin (yalnızca ilk çıkış ve son varış)
      const kind = isFerry ? "ferry" : stepKind(m.type);
      if ((kind === "depart" && li > 0) || (kind === "arrive" && li < legs.length - 1)) continue;
      if (steps.length >= MAX_STEPS) continue;
      const at = pts[Math.min(Math.max(0, m.begin_shape_index), pts.length - 1)];
      steps.push({
        instruction: (m.instruction ?? "").trim().slice(0, 300),
        kind,
        distanceMeters: Math.round(m.length * 1000),
        durationSeconds: Math.round(m.time),
        location: { lat: +at.lat.toFixed(5), lng: +at.lng.toFixed(5) },
        toll: Boolean(m.toll) && !isFerry,
      });
    }
  });
  return {
    distanceMeters: Math.round(trip.summary.length * 1000),
    durationSeconds: Math.round(trip.summary.time),
    encodedPolyline: encodePolyline(path, 5),
    legs: legs.map((l) => ({ distanceMeters: Math.round(l.summary.length * 1000), durationSeconds: Math.round(l.summary.time) })),
    // Manevra yoksa (eski yanıt biçimi) özet bayrağına güven
    hasToll: sawManeuvers ? roadToll : Boolean(trip.summary.has_toll),
    hasFerry: ferry,
    hasHighway: Boolean(trip.summary.has_highway),
    steps,
  };
}

/** Valhalla hata kodları: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/#http-status-codes-and-conditions */
function mapError(httpStatus: number, body: VResponse): GeoError {
  const code = body.error_code ?? 0;
  const detail = `valhalla ${httpStatus} ${code} ${body.error ?? ""}`.trim();
  if (code === 442 || code === 443) return new GeoError("zero_results", detail); // rota bulunamadı
  if (code === 171 || code === 170) return new GeoError("zero_results", detail); // noktaya yakın yol yok
  if (code === 154 || code === 150) return new GeoError("invalid_request", detail); // mesafe/nokta sınırı
  if (httpStatus >= 400 && httpStatus < 500) return new GeoError("invalid_request", detail);
  return new GeoError("upstream", detail);
}

async function request(points: LatLng[], alternatives: boolean, options: RouteOptions, tollMode: "none" | "exclude" | "soft") {
  const { status, body } = await fetchJson<VResponse>(`${valhallaUrl()}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRouteRequest(points, alternatives, options, tollMode)),
    timeoutMs: 20_000,
  });
  if (status !== 200 || !body.trip) throw mapError(status, body);
  return [body.trip, ...(body.alternates ?? []).map((a) => a.trip)].map(toRoute);
}

/** Neredeyse aynı rotaları ele (mesafe ve süre %1,5 içinde), süreye göre sırala, en fazla 3. */
export function mergeRoutes(groups: ComputedRoute[][]): ComputedRoute[] {
  const out: ComputedRoute[] = [];
  for (const r of groups.flat().sort((a, b) => a.durationSeconds - b.durationSeconds)) {
    const dup = out.some((o) =>
      Math.abs(o.distanceMeters - r.distanceMeters) <= o.distanceMeters * 0.015 &&
      Math.abs(o.durationSeconds - r.durationSeconds) <= o.durationSeconds * 0.015 &&
      o.hasFerry === r.hasFerry);
    if (!dup) out.push(r);
  }
  return out.slice(0, MAX_ROUTES);
}

/**
 * Rota hesapla. "Ücretli yollardan kaçın" + feribot serbest olduğunda iki istek atılır:
 * kesin ücretsiz rota ve ücretli yolu cezalandıran (feribota izin veren) rota. İkincisinden yalnızca
 * karayolu ücreti olmayanlar (ör. Eskihisar–Topçular feribotu) alınır. OSM'de feribotlar ücretli
 * işaretli olduğundan tek başına exclude_tolls feribotu da dışlar ve gereksiz uzun yol verirdi.
 */
export async function computeRoute(points: LatLng[], alternatives: boolean, options: RouteOptions = NO_OPTIONS): Promise<RouteResponse> {
  const alternativesSupported = points.length === 2;
  if (!options.avoidTolls) {
    return { routes: mergeRoutes([await request(points, alternatives, options, "none")]), alternativesSupported };
  }
  if (options.avoidFerries) {
    return { routes: mergeRoutes([await request(points, alternatives, options, "exclude")]), alternativesSupported };
  }
  // Herkese açık sunucu saniyede 1 istek ister: istekler sırayla
  let strict: ComputedRoute[] = [];
  let strictError: GeoError | null = null;
  const started = Date.now();
  try {
    strict = await request(points, alternatives, options, "exclude");
  } catch (e) {
    if (!(e instanceof GeoError) || e.code !== "zero_results") throw e;
    strictError = e;
  }
  let soft: ComputedRoute[] = [];
  const wait = 1_050 - (Date.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  try {
    soft = (await request(points, alternatives, options, "soft")).filter((r) => !r.hasToll);
  } catch (e) {
    if (!strict.length) throw e;
  }
  const routes = mergeRoutes([strict, soft]);
  if (!routes.length) throw strictError ?? new GeoError("zero_results", "no toll-free route");
  return { routes, alternativesSupported };
}
