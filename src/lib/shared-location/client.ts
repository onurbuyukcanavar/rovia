"use client";
import { MapsClientError } from "@/lib/maps/client";
import type { Stop } from "@/lib/maps/types";
import type { ResolvedLocation } from "./types";
import { t } from "@/i18n";

export type { ResolvedLocation };

/** Paylaşılan metni sunucuda konuma çevirir (kısa bağlantı, yer adı araması, ters adres araması). */
export async function resolveLocation(text: string, label?: string | null, signal?: AbortSignal): Promise<ResolvedLocation> {
  let res: Response;
  try {
    res = await fetch("/api/location/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 4000), label: label ?? null }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new MapsClientError("network", t.maps.errors.upstream);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code: string; message: string } } | null)?.error;
    const code = err?.code ?? "upstream";
    const message =
      code === "not_found" || code === "zero_results" ? t.sharedLocation.errors.notFound
        : code === "invalid_request" ? t.sharedLocation.errors.unresolved
          : code === "timeout" ? t.sharedLocation.errors.timeout
            : (err?.message ?? t.maps.errors.upstream);
    throw new MapsClientError(code, message);
  }
  return (json as { location: ResolvedLocation }).location;
}

/** Planlayıcı durağı. */
export function locationToStop(loc: Pick<ResolvedLocation, "lat" | "lng" | "label" | "address">): Stop {
  return {
    id: `p${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}`,
    label: loc.label ?? loc.address ?? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`,
    address: loc.label ? loc.address : null,
    ref: null,
    location: { lat: loc.lat, lng: loc.lng },
  };
}
