import "server-only";
import { decodePolyline, encodePolyline, type LatLng } from "@/lib/geo";
import type { RouteOptions, RouteStep, StepKind } from "@/lib/maps/types";
import { GeoError } from "./errors";
import { fetchJson } from "./http";
import { chooseBridge, crowKm, exemptBridge, needsStraitCrossing } from "./straits";

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
  /** Ücretli yol/köprü/otoyol. Feribot ücreti ve istisna köprüler (bkz. straits.ts) sayılmaz. */
  hasToll: boolean;
  hasFerry: boolean;
  /** Otoyol (istisna köprüler ve bağlantıları hariç) */
  hasHighway: boolean;
  /** Kullanılan istisna köprüler (gerçekte geçiş ücretlidir; arayüzde belirtilir) */
  tollBridges: string[];
  steps: RouteStep[];
};

export type RouteResponse = { routes: ComputedRoute[]; alternativesSupported: boolean };

type VManeuver = {
  type: number; instruction?: string; length: number; time: number; begin_shape_index: number; end_shape_index?: number;
  toll?: boolean; ferry?: boolean; highway?: boolean; street_names?: string[]; begin_street_names?: string[];
};
export type VLeg = { shape: string; summary: { length: number; time: number }; maneuvers?: VManeuver[] };
type VTrip = {
  legs?: VLeg[];
  summary?: { length: number; time: number; has_toll?: boolean; has_ferry?: boolean; has_highway?: boolean };
};
type VResponse = { trip?: VTrip; alternates?: { trip: VTrip }[]; error_code?: number; error?: string; status_code?: number };

/**
 * İstek kipi:
 * - "plain": kaçınma yok (feribot seçeneğine uyulur)
 * - "strict": seçilen kaçınmalar kesin dışlama (exclude_*)
 * - "relaxed": yalnızca feribot kaçınması kesin; ücretli yol/otoyol serbest — aday üretmek için.
 *   Adaylar sonradan istisnalarla (köprüler, feribot ücreti) sınıflandırılıp süzülür.
 * - "relaxed-shortest": relaxed + en kısa rota
 */
export type Mode = "plain" | "strict" | "relaxed" | "relaxed-shortest";

function costing(options: RouteOptions, mode: Mode) {
  const auto: Record<string, unknown> = {};
  if (options.avoidFerries) auto.exclude_ferries = true;
  else auto.use_ferry = 1;
  if (mode === "strict") {
    if (options.avoidHighways) auto.exclude_highways = true;
    if (options.avoidTolls) auto.exclude_tolls = true;
  }
  if (mode === "relaxed-shortest") auto.shortest = true;
  return { auto };
}

export function buildRouteRequest(points: LatLng[], alternatives: boolean, options: RouteOptions = NO_OPTIONS, mode: Mode = "strict") {
  if (points.length < 2) throw new GeoError("invalid_request", "need ≥2 points");
  if (points.length > MAX_INTERMEDIATES + 2) throw new GeoError("invalid_request", "too many points");
  return {
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
    costing: "auto",
    costing_options: costing(options, mode),
    units: "kilometers",
    language: "tr-TR",
    // "instructions": manevralar + Türkçe anlatım ("maneuvers" anlatımı içermez)
    directions_type: "instructions",
    // Valhalla alternatifleri yalnızca iki noktalı isteklerde hesaplar
    ...(alternatives && points.length === 2 ? { alternates: 2 } : {}),
  };
}

const NO_OPTIONS: RouteOptions = { avoidTolls: false, avoidHighways: false, avoidFerries: false };
const anyAvoid = (o: RouteOptions) => o.avoidTolls || o.avoidHighways || o.avoidFerries;

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

/**
 * Ham Valhalla bacaklarından rota oluştur. userLegs[i]: kullanıcının i. bacağını (durak i → i+1) oluşturan ham
 * bacaklar — normalde bir tane; boğaz köprüsü üzerinden zorlanan rotalarda birden fazla parça.
 */
export function assembleRoute(userLegs: VLeg[][]): ComputedRoute {
  if (!userLegs.length || userLegs.some((l) => !l.length)) throw new GeoError("upstream", "trip without legs");
  const path: LatLng[] = [];
  const steps: RouteStep[] = [];
  const bridges = new Set<string>();
  let roadToll = false;
  let ferry = false;
  let highway = false;
  const raw = userLegs.flat();

  raw.forEach((leg, rawIndex) => {
    const first = rawIndex === 0;
    const last = rawIndex === raw.length - 1;
    const pts = decodePolyline(leg.shape, 6);
    // Parçalar uç uca eklenir; ortak noktayı tekrar ekleme
    const prev = path[path.length - 1];
    const same = prev && pts[0] && Math.abs(prev.lat - pts[0].lat) < 1e-6 && Math.abs(prev.lng - pts[0].lng) < 1e-6;
    path.push(...pts.slice(same ? 1 : 0));

    for (const m of leg.maneuvers ?? []) {
      const isFerry = Boolean(m.ferry) || m.type === 28;
      const at = (i: number) => pts[Math.min(Math.max(0, i), pts.length - 1)];
      const from = at(m.begin_shape_index);
      const to = at(m.end_shape_index ?? m.begin_shape_index);
      const names = m.street_names ?? m.begin_street_names ?? [];
      const instruction = (m.instruction ?? "").trim();
      let stepToll = false;
      if (isFerry) ferry = true;
      if (m.toll && !isFerry) {
        const exempt = exemptBridge(from, to, names, instruction, "toll");
        if (exempt) bridges.add(exempt);
        else {
          roadToll = true;
          stepToll = true;
        }
      }
      if (m.highway && !isFerry) {
        const exempt = exemptBridge(from, to, names, instruction, "highway");
        if (exempt) bridges.add(exempt);
        else highway = true;
      }
      const kind = isFerry ? "ferry" : stepKind(m.type);
      // Ara parçaların varış/çıkış manevraları tekrar etmesin (yalnızca ilk çıkış ve son varış)
      if ((kind === "depart" && !first) || (kind === "arrive" && !last)) continue;
      if (steps.length >= MAX_STEPS) continue;
      steps.push({
        instruction: instruction.slice(0, 300),
        kind,
        distanceMeters: Math.round(m.length * 1000),
        durationSeconds: Math.round(m.time),
        location: { lat: +from.lat.toFixed(5), lng: +from.lng.toFixed(5) },
        toll: stepToll,
      });
    }
  });

  const legs = userLegs.map((parts) => ({
    distanceMeters: Math.round(parts.reduce((s, l) => s + l.summary.length, 0) * 1000),
    durationSeconds: Math.round(parts.reduce((s, l) => s + l.summary.time, 0)),
  }));
  return {
    distanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
    durationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
    encodedPolyline: encodePolyline(path, 5),
    legs,
    hasToll: roadToll,
    hasFerry: ferry,
    hasHighway: highway,
    tollBridges: [...bridges],
    steps,
  };
}

/** Tek Valhalla yolculuğu → rota (her ham bacak bir kullanıcı bacağı). Manevrasız yanıtta özet bayrakları kullanılır. */
export function toRoute(trip: VTrip): ComputedRoute {
  const legs = trip.legs ?? [];
  if (!legs.length || !trip.summary) throw new GeoError("upstream", "trip without legs");
  const r = assembleRoute(legs.map((l) => [l]));
  if (!legs.some((l) => l.maneuvers?.length)) {
    return { ...r, hasToll: Boolean(trip.summary.has_toll), hasFerry: Boolean(trip.summary.has_ferry), hasHighway: Boolean(trip.summary.has_highway) };
  }
  return r;
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

/** Herkese açık sunucu saniyede 1 istek ister: aynı hesaplamadaki istekler aralıklı atılır. */
function makeRequester() {
  let last = 0;
  return async (points: LatLng[], alternatives: boolean, options: RouteOptions, mode: Mode): Promise<VTrip[]> => {
    const wait = 1_050 - (Date.now() - last);
    if (last && wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const { status, body } = await fetchJson<VResponse>(`${valhallaUrl()}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRouteRequest(points, alternatives, options, mode)),
        timeoutMs: 20_000,
      });
      if (status !== 200 || !body.trip) throw mapError(status, body);
      return [body.trip, ...(body.alternates ?? []).map((a) => a.trip)];
    } finally {
      last = Date.now();
    }
  };
}
type Requester = ReturnType<typeof makeRequester>;

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

/** Seçeneklere uyuyor mu (istisnalar hesaba katılmış bayraklarla) */
export const satisfies = (r: ComputedRoute, o: RouteOptions) =>
  !(o.avoidTolls && r.hasToll) && !(o.avoidHighways && r.hasHighway) && !(o.avoidFerries && r.hasFerry);

/**
 * Anlamsız dolambaç mı? Duraklar arası kuş uçuşunun 3 katından uzun VE 300 km'den fazla sapma.
 * (Ör. üç kaçınma birden seçilince Tekirdağ → Bursa için Kazakistan üzerinden 15.718 km.)
 * Gebze → Yalova'nın körfez çevresinden 116 km'lik ücretsiz yolu gibi gerçek dolambaçlar geçer.
 */
export function isAbsurd(r: ComputedRoute, points: LatLng[]) {
  const crow = crowKm(points);
  const km = r.distanceMeters / 1000;
  return km > crow * 3 && km - crow > 300;
}

/**
 * Boğaz köprüsü üzerinden zorlanan aday: yakası değişen her bacakta köprüye kadar ve köprüden sonrası
 * kesin kaçınmalarla, köprü geçişi serbest hesaplanır; parçalar kesintisiz birleştirilir.
 */
export async function viaBridges(req: Requester, points: LatLng[], options: RouteOptions): Promise<ComputedRoute | null> {
  type Piece = { pts: LatLng[]; legOf: number[] };
  const strictPieces: Piece[] = [];
  const crossingLegs: number[] = [];
  let cur: Piece = { pts: [points[0]], legOf: [] };
  for (let i = 0; i < points.length - 1; i++) {
    const b = points[i + 1];
    if (needsStraitCrossing(points[i], b)) {
      const { enter, exit } = chooseBridge(points[i], b);
      cur.pts.push(enter);
      cur.legOf.push(i);
      strictPieces.push(cur);
      crossingLegs.push(i);
      cur = { pts: [exit, b], legOf: [i] };
    } else {
      cur.pts.push(b);
      cur.legOf.push(i);
    }
  }
  strictPieces.push(cur);
  if (!crossingLegs.length) return null;

  const strictLegs: VLeg[][] = [];
  for (const p of strictPieces) {
    const [trip] = await req(p.pts, false, options, "strict");
    strictLegs.push(trip.legs ?? []);
  }
  const userLegs: VLeg[][] = points.slice(1).map(() => []);
  for (let k = 0; k < strictPieces.length; k++) {
    if (k > 0) {
      // Köprü geçişi: önceki parçanın gerçek bitişinden sonraki parçanın gerçek başlangıcına
      const prevLegs = strictLegs[k - 1];
      const prevPts = decodePolyline(prevLegs[prevLegs.length - 1].shape, 6);
      const nextPts = decodePolyline(strictLegs[k][0].shape, 6);
      const [bridgeTrip] = await req([prevPts[prevPts.length - 1], nextPts[0]], false, options, "relaxed");
      userLegs[crossingLegs[k - 1]].push(...(bridgeTrip.legs ?? []));
    }
    strictLegs[k].forEach((leg, j) => userLegs[strictPieces[k].legOf[j]].push(leg));
  }
  return assembleRoute(userLegs);
}

/**
 * Rota hesapla.
 * - Kaçınma yoksa: tek istek (feribotlar cezasız; Eskihisar–Topçular gibi feribotlar rota/alternatif olur).
 * - Kaçınma varsa adaylar toplanır, istisnalarla sınıflandırılır; seçeneklere uymayanlar ve anlamsız dolambaçlar elenir:
 *   1. kesin dışlamalı rota;
 *   2. ücretli yol/otoyol kaçınmasında serbest rotalar (alternatiflerle) — feribot ücreti ve istisna köprüler
 *      ücretli/otoyol sayılmaz, bunlardan uygun olanlar kalır; hâlâ aday yoksa en kısa rota;
 *   3. hâlâ aday yoksa ve rota boğaz geçiyorsa en uygun köprü üzerinden zorlanan rota.
 *   Uygun aday kalmazsa "no_suitable_route" (arayüz: "Uygun rota bulunamamaktadır").
 */
export async function computeRoute(points: LatLng[], alternatives: boolean, options: RouteOptions = NO_OPTIONS, requester?: Requester): Promise<RouteResponse> {
  const alternativesSupported = points.length === 2;
  const req = requester ?? makeRequester();
  if (!anyAvoid(options)) {
    return { routes: mergeRoutes([(await req(points, alternatives, options, "plain")).map(toRoute)]), alternativesSupported };
  }

  const ok = (routes: ComputedRoute[]) => routes.filter((r) => satisfies(r, options) && !isAbsurd(r, points));
  let invalid: GeoError | null = null;
  const attempt = async (fn: () => Promise<ComputedRoute[]>) => {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof GeoError) || (e.code !== "zero_results" && e.code !== "invalid_request")) throw e;
      if (e.code === "invalid_request") invalid ??= e;
      return [];
    }
  };

  const strict = ok(await attempt(async () => (await req(points, alternatives, options, "strict")).map(toRoute)));
  let extra: ComputedRoute[] = [];
  if (options.avoidTolls || options.avoidHighways) {
    extra = ok(await attempt(async () => (await req(points, alternatives, options, "relaxed")).map(toRoute)));
    if (!extra.length && !strict.length) {
      extra = ok(await attempt(async () => (await req(points, false, options, "relaxed-shortest")).map(toRoute)));
    }
    if (!extra.length && !strict.length) {
      extra = ok(await attempt(async () => {
        const r = await viaBridges(req, points, options);
        return r ? [r] : [];
      }));
    }
  }
  const routes = mergeRoutes([strict, extra]);
  if (!routes.length) throw invalid ?? new GeoError("no_suitable_route", "no route satisfies the selected options");
  return { routes, alternativesSupported };
}
