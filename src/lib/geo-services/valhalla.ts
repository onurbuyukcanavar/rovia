import "server-only";
import { decodePolyline, encodePolyline, type LatLng } from "@/lib/geo";
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

export type ComputedRoute = {
  distanceMeters: number;
  durationSeconds: number;
  /** Google uyumlu polyline (precision 5) — istemci ve veritabanı aynı biçimi kullanır */
  encodedPolyline: string;
  legs: { distanceMeters: number; durationSeconds: number }[];
  hasToll: boolean;
  hasFerry: boolean;
  hasHighway: boolean;
};

export type RouteResponse = { routes: ComputedRoute[]; alternativesSupported: boolean };

type VTrip = {
  legs?: { shape: string; summary: { length: number; time: number } }[];
  summary?: { length: number; time: number; has_toll?: boolean; has_ferry?: boolean; has_highway?: boolean };
};
type VResponse = { trip?: VTrip; alternates?: { trip: VTrip }[]; error_code?: number; error?: string; status_code?: number };

export function buildRouteRequest(points: LatLng[], alternatives: boolean) {
  if (points.length < 2) throw new GeoError("invalid_request", "need ≥2 points");
  if (points.length > MAX_INTERMEDIATES + 2) throw new GeoError("invalid_request", "too many points");
  return {
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
    costing: "auto",
    units: "kilometers",
    directions_type: "none",
    // Valhalla alternatifleri yalnızca iki noktalı isteklerde hesaplar
    ...(alternatives && points.length === 2 ? { alternates: 2 } : {}),
  };
}

function toRoute(trip: VTrip): ComputedRoute {
  const legs = trip.legs ?? [];
  if (!legs.length || !trip.summary) throw new GeoError("upstream", "trip without legs");
  const path: LatLng[] = [];
  for (const leg of legs) {
    const pts = decodePolyline(leg.shape, 6);
    // Bacaklar uç uca eklenir; ortak noktayı tekrar ekleme
    path.push(...(path.length ? pts.slice(1) : pts));
  }
  return {
    distanceMeters: Math.round(trip.summary.length * 1000),
    durationSeconds: Math.round(trip.summary.time),
    encodedPolyline: encodePolyline(path, 5),
    legs: legs.map((l) => ({ distanceMeters: Math.round(l.summary.length * 1000), durationSeconds: Math.round(l.summary.time) })),
    hasToll: Boolean(trip.summary.has_toll),
    hasFerry: Boolean(trip.summary.has_ferry),
    hasHighway: Boolean(trip.summary.has_highway),
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

export async function computeRoute(points: LatLng[], alternatives: boolean): Promise<RouteResponse> {
  const { status, body } = await fetchJson<VResponse>(`${valhallaUrl()}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRouteRequest(points, alternatives)),
    timeoutMs: 20_000,
  });
  if (status !== 200 || !body.trip) throw mapError(status, body);
  const routes = [body.trip, ...(body.alternates ?? []).map((a) => a.trip)].map(toRoute);
  return { routes, alternativesSupported: points.length === 2 };
}
