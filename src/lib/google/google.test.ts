import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodePolyline } from "@/lib/geo";
import { ROUTE_CATEGORIES } from "./categories";
import { MapsError, fromGeocodingStatus, fromGoogleError } from "./errors";
import { autocomplete, placeDetails, searchAlongRoute, searchNearby } from "./places";
import { buildComputeRoutesBody, computeRoutes, skuFor } from "./routes";
import { reverseGeocode } from "./geocoding";
import { parseDuration } from "./http";

type Call = { url: string; init: RequestInit };
let calls: Call[];
let responses: { status: number; body: unknown }[];

beforeEach(() => {
  calls = [];
  responses = [];
  process.env.GOOGLE_MAPS_SERVER_KEY = "test-server-key";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const header = (c: Call, name: string) => (c.init.headers as Record<string, string>)[name];
const body = (c: Call) => JSON.parse(String(c.init.body));

describe("Routes API", () => {
  const A = { location: { lat: 41.0082, lng: 28.9784 } };
  const B = { placeId: "ChIJ_ankara_place_id" };

  it("ara durak yokken alternatif ister; varken istemez (Google desteklemiyor)", () => {
    expect(buildComputeRoutesBody({ origin: A, destination: B, intermediates: [], alternatives: true, trafficAware: false }).computeAlternativeRoutes).toBe(true);
    const withStop = buildComputeRoutesBody({ origin: A, destination: B, intermediates: [A], alternatives: true, trafficAware: false });
    expect(withStop.computeAlternativeRoutes).toBe(false);
    expect(withStop.intermediates).toHaveLength(1);
  });

  it("varsayılan istek Essentials SKU: trafiksiz, ≤10 durak; Türkçe ve metrik", () => {
    const b = buildComputeRoutesBody({ origin: A, destination: B, intermediates: [], alternatives: false, trafficAware: false });
    expect(b).toMatchObject({ travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", languageCode: "tr", units: "METRIC" });
    expect(b.origin).toEqual({ location: { latLng: { latitude: 41.0082, longitude: 28.9784 } } });
    expect(b.destination).toEqual({ placeId: "ChIJ_ankara_place_id" });
    expect(skuFor(10, false)).toBe("essentials");
    expect(skuFor(11, false)).toBe("pro");
    expect(skuFor(0, true)).toBe("pro");
  });

  it("26 ara durak reddedilir", () => {
    expect(() => buildComputeRoutesBody({ origin: A, destination: B, intermediates: Array(26).fill(A), alternatives: false, trafficAware: false }))
      .toThrow(MapsError);
  });

  it("yanıtı normalize eder; alan maskesi belirtilir, anahtar URL'de değil başlıktadır", async () => {
    responses.push({ status: 200, body: { routes: [{
      distanceMeters: 452_000, duration: "16200s", staticDuration: "16000s",
      polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" }, description: "O-4",
      legs: [{ distanceMeters: 452_000, duration: "16200s" }],
      viewport: { low: { latitude: 39.9, longitude: 28.9 }, high: { latitude: 41.1, longitude: 32.9 } },
    }] } });
    const r = await computeRoutes({ origin: A, destination: B, intermediates: [], alternatives: true, trafficAware: false });
    expect(r.routes[0]).toMatchObject({ distanceMeters: 452_000, durationSeconds: 16_200, description: "O-4" });
    expect(r.routes[0].legs).toEqual([{ distanceMeters: 452_000, durationSeconds: 16_200 }]);
    expect(r.sku).toBe("essentials");
    expect(calls[0].url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes");
    expect(calls[0].url).not.toContain("test-server-key");
    expect(header(calls[0], "X-Goog-Api-Key")).toBe("test-server-key");
    expect(header(calls[0], "X-Goog-FieldMask")).toContain("routes.polyline.encodedPolyline");
    expect(header(calls[0], "X-Goog-FieldMask")).not.toContain("*");
  });

  it("rota bulunamazsa zero_results", async () => {
    responses.push({ status: 200, body: {} });
    await expect(computeRoutes({ origin: A, destination: B, intermediates: [], alternatives: false, trafficAware: false }))
      .rejects.toMatchObject({ code: "zero_results" });
  });

  it("anahtar yoksa not_configured (Google'a istek atılmaz)", async () => {
    delete process.env.GOOGLE_MAPS_SERVER_KEY;
    await expect(computeRoutes({ origin: A, destination: B, intermediates: [], alternatives: false, trafficAware: false }))
      .rejects.toMatchObject({ code: "not_configured" });
    expect(calls).toHaveLength(0);
  });
});

describe("Places API", () => {
  it("autocomplete: oturum token'ı, Türkçe, alan maskesi", async () => {
    responses.push({ status: 200, body: { suggestions: [
      { placePrediction: { placeId: "ChIJ_goreme_000", structuredFormat: { mainText: { text: "Göreme" }, secondaryText: { text: "Nevşehir" } } } },
      { queryPrediction: { text: { text: "göreme otelleri" } } },
    ] } });
    const s = await autocomplete({ text: "Göre", sessionToken: "3f2b8c1e-0000-4000-8000-000000000000" });
    expect(s).toEqual([{ placeId: "ChIJ_goreme_000", mainText: "Göreme", secondaryText: "Nevşehir" }]);
    expect(body(calls[0])).toMatchObject({ input: "Göre", languageCode: "tr", sessionToken: "3f2b8c1e-0000-4000-8000-000000000000" });
    expect(header(calls[0], "X-Goog-FieldMask")).toContain("suggestions.placePrediction.placeId");
  });

  it("yer detayı: puan/saat/telefon yalnızca detay isteğinde (Enterprise) istenir", async () => {
    responses.push({ status: 200, body: {
      id: "ChIJ_tuzgolu_00", displayName: { text: "Tuz Gölü" }, location: { latitude: 38.8, longitude: 33.4 },
      rating: 4.6, userRatingCount: 12345, regularOpeningHours: { weekdayDescriptions: ["Pazartesi: 24 saat açık"] },
      photos: [{ name: "places/ChIJ_tuzgolu_00/photos/AbC", authorAttributions: [{ displayName: "Ayşe", uri: "https://maps.google.com/x" }] }],
    } });
    const d = await placeDetails("ChIJ_tuzgolu_00");
    expect(d).toMatchObject({ name: "Tuz Gölü", rating: 4.6, ratingCount: 12345, openingHours: ["Pazartesi: 24 saat açık"] });
    expect(d.photo?.attributions).toEqual([{ name: "Ayşe", uri: "https://maps.google.com/x" }]);
    expect(header(calls[0], "X-Goog-FieldMask")).toMatch(/rating.*userRatingCount/);
  });

  it("geçersiz place id Google'a gönderilmeden reddedilir", async () => {
    await expect(placeDetails("../../etc")).rejects.toMatchObject({ code: "invalid_request" });
    expect(calls).toHaveLength(0);
  });

  it("rota boyunca arama: yalnızca Pro liste alanları; yarıçap dışı elenir; rota sırasına dizilir", async () => {
    // Doğu-batı hattı: 30°E → 32°E, enlem 40
    const polyline = encodePolyline([{ lat: 40, lng: 30 }, { lat: 40, lng: 31 }, { lat: 40, lng: 32 }]);
    responses.push({ status: 200, body: { places: [
      { id: "far", displayName: { text: "Uzak" }, location: { latitude: 40.2, longitude: 31 } },          // ~22 km
      { id: "late", displayName: { text: "Sonra" }, location: { latitude: 40.01, longitude: 31.8 } },     // ~1.1 km, ileride
      { id: "early", displayName: { text: "Önce" }, location: { latitude: 39.99, longitude: 30.2 } },     // ~1.1 km, başta
      { id: "early", displayName: { text: "Önce (tekrar)" }, location: { latitude: 39.99, longitude: 30.2 } },
    ] } });
    const r = await searchAlongRoute({ category: "fuel", encodedPolyline: polyline, radiusMeters: 5_000 });
    expect(r.map((p) => p.id)).toEqual(["early", "late"]);
    expect(r[0].distanceFromRoute).toBeGreaterThan(1_000);
    expect(r[0].distanceFromRoute).toBeLessThan(1_200);

    const req = body(calls[0]);
    expect(req).toMatchObject({ textQuery: "benzin istasyonu", includedType: "gas_station", strictTypeFiltering: true });
    expect(req.searchAlongRouteParameters.polyline.encodedPolyline).toBe(polyline);
    const mask = header(calls[0], "X-Goog-FieldMask");
    for (const enterpriseField of ["rating", "userRatingCount", "PhoneNumber", "OpeningHours", "websiteUri"]) {
      expect(mask).not.toContain(enterpriseField);
    }
  });

  it("çok sorgulu kategori (hastane + eczane) iki istek atar ve birleştirir", async () => {
    responses.push(
      { status: 200, body: { places: [{ id: "h", displayName: { text: "Hastane" }, location: { latitude: 41.0, longitude: 29.0 } }] } },
      { status: 200, body: { places: [{ id: "e", displayName: { text: "Eczane" }, location: { latitude: 41.001, longitude: 29.0 } }] } },
    );
    const r = await searchNearby({ category: "health", center: { lat: 41, lng: 29 }, radiusMeters: 2_000 });
    expect(calls).toHaveLength(2);
    expect(r.map((p) => p.id)).toEqual(["h", "e"]);
    expect(body(calls[0]).locationBias.circle.radius).toBe(2_000);
  });

  it("bilinmeyen kategori reddedilir; tüm kategoriler en az bir sorguya sahip", async () => {
    await expect(searchNearby({ category: "kumarhane", center: { lat: 41, lng: 29 }, radiusMeters: 1_000 }))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(ROUTE_CATEGORIES).toHaveLength(13);
    for (const c of ROUTE_CATEGORIES) expect(c.queries.length).toBeGreaterThan(0);
  });
});

describe("hata eşleme", () => {
  it("Google durumlarını kullanıcı mesajlarına çevirir", () => {
    expect(fromGoogleError(429, { error: { status: "RESOURCE_EXHAUSTED" } }).code).toBe("quota");
    expect(fromGoogleError(403, { error: { status: "PERMISSION_DENIED", message: "API key not authorized" } }).code).toBe("denied");
    expect(fromGoogleError(400, { error: { status: "INVALID_ARGUMENT" } }).code).toBe("invalid_request");
    expect(fromGoogleError(500, {}).code).toBe("upstream");
    expect(new MapsError("quota").userMessage).toContain("kota");
    expect(fromGeocodingStatus("OK")).toBeNull();
    expect(fromGeocodingStatus("REQUEST_DENIED")?.code).toBe("denied");
    expect(fromGeocodingStatus("ZERO_RESULTS")?.code).toBe("zero_results");
  });

  it("Google 403 yanıtı MapsError(denied) olarak yükselir; ham mesaj kullanıcı mesajına sızmaz", async () => {
    responses.push({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "secret internal detail" } } });
    const err = await autocomplete({ text: "Ankara", sessionToken: "3f2b8c1e-0000-4000-8000-000000000000" }).catch((e) => e);
    expect(err).toBeInstanceOf(MapsError);
    expect(err.code).toBe("denied");
    expect(err.userMessage).not.toContain("secret");
  });

  it("parseDuration", () => {
    expect(parseDuration("16200s")).toBe(16_200);
    expect(parseDuration("12.6s")).toBe(13);
    expect(parseDuration(undefined)).toBe(0);
  });
});

describe("Geocoding", () => {
  it("ters geocoding: ilçe, il etiketi", async () => {
    responses.push({ status: 200, body: { status: "OK", results: [{
      formatted_address: "Göreme, 50180 Göreme/Nevşehir Merkez/Nevşehir, Türkiye", place_id: "ChIJ_x",
      address_components: [{ long_name: "Nevşehir Merkez", types: ["administrative_area_level_2"] }, { long_name: "Nevşehir", types: ["administrative_area_level_1"] }],
    }] } });
    expect(await reverseGeocode({ lat: 38.64, lng: 34.83 })).toEqual({
      label: "Nevşehir Merkez, Nevşehir", address: "Göreme, 50180 Göreme/Nevşehir Merkez/Nevşehir, Türkiye", placeId: "ChIJ_x",
    });
    expect(calls[0].url).toContain("language=tr");
  });
});
