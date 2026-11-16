import "server-only";
import type { LatLng } from "@/lib/geo";
import { fetchJson } from "./http";

/**
 * Photon (Apache-2.0, https://github.com/komoot/photon) — sokak/adres düzeyinde arama için yedek.
 * Yerleşim ve ilgi noktaları ROVIA'nın kendi veritabanından gelir; burada yalnızca
 * kendi verimizde bulunmayan adresler aranır. PHOTON_URL="" ile tamamen kapatılabilir.
 */
export const photonUrl = () => process.env.PHOTON_URL ?? "https://photon.komoot.io";

export type AddressSuggestion = {
  id: string;
  name: string;
  secondary: string | null;
  location: LatLng;
};

type PFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string; osm_id?: number; name?: string; street?: string; housenumber?: string;
    district?: string; city?: string; county?: string; state?: string; country?: string; countrycode?: string;
  };
};

export async function searchAddresses(text: string, bias: LatLng | undefined, limit = 5): Promise<AddressSuggestion[]> {
  const base = photonUrl();
  if (!base) return [];
  const qs = new URLSearchParams({ q: text, limit: String(limit) });
  if (bias) {
    qs.set("lat", String(bias.lat));
    qs.set("lon", String(bias.lng));
  }
  // Yalnızca adres benzeri sonuçlar: sokaklar ve bina adresleri
  qs.append("osm_tag", "highway");
  qs.append("osm_tag", "building");
  qs.append("osm_tag", "place:house");
  const { status, body } = await fetchJson<{ features?: PFeature[] }>(`${base.replace(/\/$/, "")}/api?${qs}`, { timeoutMs: 6_000 });
  if (status !== 200) return [];
  return (body.features ?? [])
    .filter((f) => f.properties.countrycode?.toUpperCase() === "TR" || !f.properties.countrycode)
    .map((f) => {
      const p = f.properties;
      const street = [p.street, p.housenumber].filter(Boolean).join(" ");
      const name = p.name ?? (street || null);
      return name
        ? {
            id: `photon:${p.osm_type ?? "X"}${p.osm_id ?? `${f.geometry.coordinates.join(",")}`}`,
            name,
            secondary: [p.name ? street : null, p.district, p.city ?? p.county, p.state].filter(Boolean).join(", ") || null,
            location: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
          }
        : null;
    })
    .filter((x): x is AddressSuggestion => x !== null);
}
