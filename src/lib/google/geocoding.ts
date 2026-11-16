import "server-only";
import type { LatLng } from "@/lib/geo";
import { MapsError, fromGeocodingStatus } from "./errors";
import { getServerKey, googleJson } from "./http";

export type ReverseGeocodeResult = { label: string; address: string; placeId: string | null };

type GeocodeResponse = {
  status: string;
  error_message?: string;
  results?: { formatted_address: string; place_id?: string; address_components?: { long_name: string; types: string[] }[] }[];
};

/** Koordinattan okunabilir etiket (haritadan nokta seçimi, "Konumum"). Sonuç saklanmaz. */
export async function reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult> {
  // Geocoding API (web service) anahtarı `key` parametresiyle bekler; URL hiçbir yerde loglanmaz.
  const qs = new URLSearchParams({ latlng: `${point.lat},${point.lng}`, language: "tr", region: "tr", key: getServerKey() });
  const data = await googleJson<GeocodeResponse>(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
  const err = fromGeocodingStatus(data.status, data.error_message);
  if (err) throw err;
  const first = data.results?.[0];
  if (!first) throw new MapsError("zero_results", "no geocode result");
  const comp = (type: string) => first.address_components?.find((c) => c.types.includes(type))?.long_name;
  const district = comp("administrative_area_level_2") ?? comp("locality") ?? comp("sublocality");
  const province = comp("administrative_area_level_1");
  const label = [district, province].filter(Boolean).join(", ") || first.formatted_address.split(",").slice(0, 2).join(",");
  return { label, address: first.formatted_address, placeId: first.place_id ?? null };
}
