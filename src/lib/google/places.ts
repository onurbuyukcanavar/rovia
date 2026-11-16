import "server-only";
import { decodePolyline, haversine, projectOntoPolyline, type LatLng } from "@/lib/geo";
import { categoryByKey } from "./categories";
import { MapsError } from "./errors";
import { googleJson } from "./http";

const PLACES = "https://places.googleapis.com/v1";

// ---------------------------------------------------------------- Autocomplete
export type Suggestion = { placeId: string; mainText: string; secondaryText: string | null };

export async function autocomplete(input: { text: string; sessionToken: string; bias?: LatLng }): Promise<Suggestion[]> {
  const data = await googleJson<{
    suggestions?: { placePrediction?: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
  }>(`${PLACES}/places:autocomplete`, {
    body: {
      input: input.text,
      sessionToken: input.sessionToken,
      languageCode: "tr",
      regionCode: "tr",
      ...(input.bias ? { locationBias: { circle: { center: { latitude: input.bias.lat, longitude: input.bias.lng }, radius: 50_000 } } } : {}),
    },
    fieldMask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat",
  });
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .map((p) => ({
      placeId: p.placeId,
      mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondaryText: p.structuredFormat?.secondaryText?.text ?? null,
    }));
}

// ---------------------------------------------------------------- Place Details
type GPlace = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  currentOpeningHours?: { openNow?: boolean };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: { name: string; widthPx?: number; heightPx?: number; authorAttributions?: { displayName?: string; uri?: string }[] }[];
};

export type PlaceBasic = { id: string; name: string; address: string | null; location: LatLng };

const toLatLng = (l?: { latitude: number; longitude: number }) => (l ? { lat: l.latitude, lng: l.longitude } : null);

function assertPlaceId(id: string) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) throw new MapsError("invalid_request", "bad place id");
}

/** Otomatik tamamlama seçimi sonrası: aynı oturum token'ı ile (oturum bazlı faturalama). */
export async function placeBasic(placeId: string, sessionToken?: string): Promise<PlaceBasic> {
  assertPlaceId(placeId);
  const qs = new URLSearchParams({ languageCode: "tr", regionCode: "tr" });
  if (sessionToken) qs.set("sessionToken", sessionToken);
  const p = await googleJson<GPlace>(`${PLACES}/places/${placeId}?${qs}`, {
    fieldMask: "id,displayName,formattedAddress,location",
  });
  const location = toLatLng(p.location);
  if (!location) throw new MapsError("not_found", "place without location");
  return { id: p.id, name: p.displayName?.text ?? "", address: p.formattedAddress ?? null, location };
}

export type PlaceDetails = PlaceBasic & {
  typeLabel: string | null;
  rating: number | null;
  ratingCount: number | null;
  openNow: boolean | null;
  openingHours: string[];
  phone: string | null;
  phoneInternational: string | null;
  website: string | null;
  googleMapsUri: string | null;
  photo: { name: string; attributions: { name: string; uri: string | null }[] } | null;
};

/** Kullanıcı bir yeri açtığında. Puan, saat ve telefon Enterprise SKU'dur; yalnızca burada istenir. */
export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  assertPlaceId(placeId);
  const p = await googleJson<GPlace>(`${PLACES}/places/${placeId}?languageCode=tr&regionCode=tr`, {
    fieldMask: [
      "id", "displayName", "formattedAddress", "location", "primaryTypeDisplayName", "rating", "userRatingCount",
      "currentOpeningHours.openNow", "regularOpeningHours.weekdayDescriptions", "nationalPhoneNumber",
      "internationalPhoneNumber", "websiteUri", "googleMapsUri", "photos",
    ].join(","),
  });
  const location = toLatLng(p.location);
  if (!location) throw new MapsError("not_found", "place without location");
  const photo = p.photos?.[0];
  return {
    id: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? null,
    location,
    typeLabel: p.primaryTypeDisplayName?.text ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    openNow: p.currentOpeningHours?.openNow ?? null,
    openingHours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    phone: p.nationalPhoneNumber ?? null,
    phoneInternational: p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    googleMapsUri: p.googleMapsUri ?? null,
    photo: photo
      ? { name: photo.name, attributions: (photo.authorAttributions ?? []).map((a) => ({ name: a.displayName ?? "", uri: a.uri ?? null })) }
      : null,
  };
}

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const isValidPhotoName = (name: string) => PHOTO_NAME.test(name);

/** Fotoğrafın geçici, anahtarsız URL'sini döndürür (anahtar istemciye hiç gitmez). */
export async function photoUri(name: string, maxWidthPx: number): Promise<string> {
  if (!isValidPhotoName(name)) throw new MapsError("invalid_request", "bad photo name");
  const width = Math.min(1600, Math.max(100, Math.round(maxWidthPx)));
  const data = await googleJson<{ photoUri?: string }>(`${PLACES}/${name}/media?maxWidthPx=${width}&skipHttpRedirect=true`);
  if (!data.photoUri) throw new MapsError("not_found", "no photo uri");
  return data.photoUri;
}

// ---------------------------------------------------------------- Rota boyunca arama
export type RoutePlace = {
  id: string;
  name: string;
  address: string | null;
  location: LatLng;
  typeLabel: string | null;
  /** Rotaya uzaklık (m); rota yoksa merkeze uzaklık */
  distanceFromRoute: number;
  /** Rotanın başından itibaren konum (m); rota yoksa null */
  alongRoute: number | null;
};

const LIST_FIELDS = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryTypeDisplayName";

async function textSearch(body: Record<string, unknown>): Promise<GPlace[]> {
  const data = await googleJson<{ places?: GPlace[] }>(`${PLACES}/places:searchText`, { body, fieldMask: LIST_FIELDS });
  return data.places ?? [];
}

function baseQuery(q: { text: string; type?: string }) {
  return {
    textQuery: q.text,
    ...(q.type ? { includedType: q.type, strictTypeFiltering: true } : {}),
    languageCode: "tr",
    regionCode: "tr",
    pageSize: 20,
  };
}

function dedupe(places: GPlace[]) {
  const seen = new Set<string>();
  return places.filter((p) => (p.location && !seen.has(p.id) ? (seen.add(p.id), true) : false));
}

/**
 * Rota boyunca kategori araması: Text Search (New) + searchAlongRouteParameters.
 * Google sonuçları rotaya göre önceliklendirir; ROVIA ayrıca kullanıcının seçtiği
 * yarıçapın dışında kalanları eler ve sonuçları rota sırasına göre dizer.
 */
export async function searchAlongRoute(input: {
  category: string; encodedPolyline: string; radiusMeters: number;
}): Promise<RoutePlace[]> {
  const category = categoryByKey(input.category);
  if (!category) throw new MapsError("invalid_request", "unknown category");
  let path: LatLng[];
  try {
    path = decodePolyline(input.encodedPolyline);
  } catch {
    throw new MapsError("invalid_request", "bad polyline");
  }
  if (path.length < 2) throw new MapsError("invalid_request", "polyline too short");

  const results = await Promise.all(
    category.queries.map((q) =>
      textSearch({ ...baseQuery(q), searchAlongRouteParameters: { polyline: { encodedPolyline: input.encodedPolyline } } }),
    ),
  );

  return dedupe(results.flat())
    .map((p) => {
      const location = toLatLng(p.location)!;
      const proj = projectOntoPolyline(location, path);
      return {
        id: p.id,
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? null,
        location,
        typeLabel: p.primaryTypeDisplayName?.text ?? null,
        distanceFromRoute: Math.round(proj.distance),
        alongRoute: Math.round(proj.alongDistance),
      };
    })
    .filter((p) => p.distanceFromRoute <= input.radiusMeters)
    .sort((a, b) => (a.alongRoute ?? 0) - (b.alongRoute ?? 0));
}

/** Rota yokken: haritanın merkezi çevresinde kategori araması. */
export async function searchNearby(input: { category: string; center: LatLng; radiusMeters: number }): Promise<RoutePlace[]> {
  const category = categoryByKey(input.category);
  if (!category) throw new MapsError("invalid_request", "unknown category");
  const radius = Math.min(50_000, input.radiusMeters);
  const results = await Promise.all(
    category.queries.map((q) =>
      textSearch({
        ...baseQuery(q),
        locationBias: { circle: { center: { latitude: input.center.lat, longitude: input.center.lng }, radius } },
      }),
    ),
  );
  return dedupe(results.flat())
    .map((p) => {
      const location = toLatLng(p.location)!;
      return {
        id: p.id,
        name: p.displayName?.text ?? "",
        address: p.formattedAddress ?? null,
        location,
        typeLabel: p.primaryTypeDisplayName?.text ?? null,
        distanceFromRoute: Math.round(haversine(input.center, location)),
        alongRoute: null,
      };
    })
    .filter((p) => p.distanceFromRoute <= radius)
    .sort((a, b) => a.distanceFromRoute - b.distanceFromRoute);
}
