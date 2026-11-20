"use client";
import type { LatLng } from "@/lib/geo";
import { DEFAULT_ROUTE_OPTIONS, type FoundPlace, type RouteOptions, type RouteResult, type Stop, type Suggestion } from "./types";
import type { BBox } from "@/lib/explore/geo";
import type { ExploreResponse } from "@/lib/explore/types";
import type { WikiInfo } from "@/lib/wiki/parse";
import type { WikiRequest } from "@/lib/wiki/tags";
import { t } from "@/i18n";

/** Sunucunun döndürdüğü Türkçe hata mesajını taşır. */
export class MapsClientError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MapsClientError";
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/maps/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new MapsClientError("network", t.maps.errors.upstream);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code: string; message: string } } | null)?.error;
    throw new MapsClientError(err?.code ?? "upstream", err?.message ?? t.maps.errors.upstream);
  }
  return json as T;
}

export const mapsApi = {
  autocomplete: (text: string, bias: LatLng | undefined, signal?: AbortSignal) =>
    post<{ suggestions: Suggestion[] }>("autocomplete", { text, bias }, signal).then((r) => r.suggestions),

  route: (stops: { origin: Stop; destination: Stop; waypoints: Stop[]; options?: RouteOptions }, opts: { alternatives: boolean }, signal?: AbortSignal) =>
    post<RouteResult>(
      "route",
      {
        origin: stops.origin.location,
        destination: stops.destination.location,
        intermediates: stops.waypoints.map((w) => w.location),
        alternatives: opts.alternatives,
        options: stops.options ?? DEFAULT_ROUTE_OPTIONS,
      },
      signal,
    ),

  searchAlongRoute: (category: string, encodedPolyline: string, radiusMeters: number, signal?: AbortSignal) =>
    post<{ places: FoundPlace[] }>("search", { mode: "route", category, encodedPolyline, radiusMeters }, signal).then((r) => r.places),

  suggestAlongRoute: (encodedPolyline: string, signal?: AbortSignal) =>
    post<{ places: FoundPlace[] }>("search", { mode: "suggest", encodedPolyline }, signal).then((r) => r.places),

  searchNearby: (category: string, center: LatLng, radiusMeters: number, signal?: AbortSignal) =>
    post<{ places: FoundPlace[] }>("search", { mode: "nearby", category, center, radiusMeters }, signal).then((r) => r.places),

  /** Keşfet: harita alanında (bbox) ya da rota boyunca (polyline + yarıçap) kategori araması. */
  explore: (
    input: { category: string; bbox?: BBox; encodedPolyline?: string; radiusMeters?: number; limit?: number },
    signal?: AbortSignal,
  ) => post<ExploreResponse>("explore", input, signal),

  /** Yer için Vikipedi/Wikidata bilgisi; madde yoksa null. */
  wiki: (input: WikiRequest, signal?: AbortSignal) => post<{ info: WikiInfo | null }>("wiki", input, signal).then((r) => r.info),

  reverseGeocode: (point: LatLng) => post<{ label: string }>("reverse-geocode", point),
};
