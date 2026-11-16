import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/geo";
import { GeoError } from "./errors";
import { autocomplete, reverseGeocode, searchAlongRoute } from "./features";
import { searchAddresses } from "./photon";
import { buildRouteRequest, computeRoute, MAX_INTERMEDIATES } from "./valhalla";

type Call = { url: string; init: RequestInit };
let calls: Call[];
let responses: { status: number; body: unknown }[];

beforeEach(() => {
  calls = [];
  responses = [];
  delete process.env.VALHALLA_URL;
  delete process.env.PHOTON_URL;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const IST = { lat: 41.0082, lng: 28.9784 };
const BOLU = { lat: 40.7356, lng: 31.6061 };
const ANK = { lat: 39.9334, lng: 32.8597 };

describe("Valhalla rota istemcisi", () => {
  it("istek: tüm noktalar 'break', araç, km; alternatif yalnızca iki noktada", () => {
    const two = buildRouteRequest([IST, ANK], true);
    expect(two).toMatchObject({ costing: "auto", units: "kilometers", directions_type: "none", alternates: 2 });
    expect(two.locations).toEqual([
      { lat: IST.lat, lon: IST.lng, type: "break" },
      { lat: ANK.lat, lon: ANK.lng, type: "break" },
    ]);
    expect(buildRouteRequest([IST, BOLU, ANK], true)).not.toHaveProperty("alternates");
    expect(() => buildRouteRequest([IST], false)).toThrow(GeoError);
    expect(() => buildRouteRequest(Array(MAX_INTERMEDIATES + 3).fill(IST), false)).toThrow(GeoError);
  });

  it("yanıt: bacaklar birleştirilir, polyline6 → polyline5, km → m; alternatifler eklenir", async () => {
    const leg1 = encodePolyline([IST, { lat: 40.8, lng: 30.0 }, BOLU], 6);
    const leg2 = encodePolyline([BOLU, ANK], 6);
    const alt = encodePolyline([IST, { lat: 40.5, lng: 30.5 }, ANK], 6);
    responses.push({ status: 200, body: {
      trip: {
        legs: [{ shape: leg1, summary: { length: 262.4, time: 9_100 } }, { shape: leg2, summary: { length: 190.1, time: 7_000 } }],
        summary: { length: 452.5, time: 16_100, has_toll: true, has_ferry: false, has_highway: true },
      },
      alternates: [{ trip: { legs: [{ shape: alt, summary: { length: 470, time: 17_000 } }], summary: { length: 470, time: 17_000 } } }],
    } });
    const r = await computeRoute([IST, BOLU, ANK], true);

    expect(calls[0].url).toBe("https://valhalla1.openstreetmap.de/route");
    expect((calls[0].init.headers as Record<string, string>)["User-Agent"]).toMatch(/^ROVIA\//);
    expect(r.routes).toHaveLength(2);
    expect(r.routes[0]).toMatchObject({ distanceMeters: 452_500, durationSeconds: 16_100, hasToll: true, hasHighway: true });
    expect(r.routes[0].legs).toEqual([{ distanceMeters: 262_400, durationSeconds: 9_100 }, { distanceMeters: 190_100, durationSeconds: 7_000 }]);
    const path = decodePolyline(r.routes[0].encodedPolyline, 5);
    expect(path).toHaveLength(4); // ortak Bolu noktası bir kez
    expect(path[0]).toEqual({ lat: 41.00820, lng: 28.97840 });
    expect(path.at(-1)).toEqual({ lat: 39.93340, lng: 32.85970 });
  });

  it("VALHALLA_URL ile kendi sunucumuza yönlenir", async () => {
    process.env.VALHALLA_URL = "https://routing.rovia.app/";
    responses.push({ status: 400, body: { error_code: 442, error: "No path could be found for input", status_code: 400 } });
    await computeRoute([IST, ANK], false).catch(() => null);
    expect(calls[0].url).toBe("https://routing.rovia.app/route");
  });

  it("hata eşleme: rota yok → zero_results, 429 → busy, ağ → upstream", async () => {
    responses.push({ status: 400, body: { error_code: 442, error: "No path could be found for input", status_code: 400 } });
    await expect(computeRoute([IST, ANK], false)).rejects.toMatchObject({ code: "zero_results" });
    responses.push({ status: 429, body: {} });
    await expect(computeRoute([IST, ANK], false)).rejects.toMatchObject({ code: "busy" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(computeRoute([IST, ANK], false)).rejects.toMatchObject({ code: "upstream" });
  });

  it("kullanıcı mesajı Türkçe ve iç ayrıntı içermez", () => {
    const e = new GeoError("busy", "valhalla 429 secret-host-detail");
    expect(e.userMessage).toContain("yoğun");
    expect(e.userMessage).not.toContain("secret");
  });
});

describe("Photon adres yedeği", () => {
  it("adres sonuçlarını dönüştürür, Türkiye dışını eler", async () => {
    responses.push({ status: 200, body: { features: [
      { geometry: { coordinates: [29.03, 41.04] }, properties: { osm_type: "W", osm_id: 5, street: "Bağdat Caddesi", housenumber: "25", district: "Kadıköy", city: "İstanbul", countrycode: "TR" } },
      { geometry: { coordinates: [13.4, 52.5] }, properties: { osm_type: "W", osm_id: 6, street: "Bagdadstraße", city: "Berlin", countrycode: "DE" } },
    ] } });
    const r = await searchAddresses("bağdat caddesi 25", { lat: 41, lng: 29 });
    expect(r).toEqual([{ id: "photon:W5", name: "Bağdat Caddesi 25", secondary: "Kadıköy, İstanbul", location: { lat: 41.04, lng: 29.03 } }]);
    const url = new URL(calls[0].url);
    expect(url.searchParams.getAll("osm_tag")).toEqual(["highway", "building", "place:house"]);
    expect(url.searchParams.get("lat")).toBe("41");
  });

  it("PHOTON_URL boşsa hiç istek atmaz", async () => {
    process.env.PHOTON_URL = "";
    expect(await searchAddresses("x yz", undefined)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

/** Supabase istemcisinin rpc() çağrılarını kaydeden sahte nesne. */
function fakeDb(results: Record<string, { data?: unknown; error?: { code?: string; message: string } }>) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return results[fn] ?? { data: [], error: null };
    },
  };
  return { db: db as never, rpcCalls };
}

describe("ROVIA veritabanı araması", () => {
  it("rota boyunca: polyline GeoJSON'a çevrilir, sadeleştirilir ve sonuç dönüştürülür", async () => {
    const path = Array.from({ length: 3_000 }, (_, i) => ({ lat: 40 + Math.sin(i / 50) * 0.01, lng: 29 + i * 0.001 }));
    const { db, rpcCalls } = fakeDb({
      search_features_along_route: { data: [
        { osm_ref: "n1", name: "Bolu Dağı Petrol", category: "fuel", subtype: "fuel", admin: "Bolu", tags: { opening_hours: "24/7" }, lat: 40.74, lng: 31.6, distance_m: 120.4, along_m: 262000.7 },
      ] },
    });
    const r = await searchAlongRoute(db, { category: "fuel", encodedPolyline: encodePolyline(path), radiusMeters: 5_000 });
    expect(r).toEqual([{
      id: "n1", name: "Bolu Dağı Petrol", address: "Bolu", location: { lat: 40.74, lng: 31.6 }, category: "fuel",
      typeLabel: "Akaryakıt istasyonu", tags: { opening_hours: "24/7" }, distanceFromRoute: 120, alongRoute: 262001,
    }]);
    const args = rpcCalls[0].args as { p_route: { type: string; coordinates: number[][] }; p_categories: string[] };
    expect(args.p_route.type).toBe("LineString");
    expect(args.p_route.coordinates.length).toBeLessThanOrEqual(2_000);
    expect(args.p_route.coordinates[0]).toEqual([29, 40]); // [lng, lat]
    expect(args.p_categories).toEqual(["fuel"]);
  });

  it("bozuk polyline reddedilir; veritabanı doğrulama hatası invalid_request olur", async () => {
    const { db } = fakeDb({ search_features_along_route: { error: { code: "22023", message: "invalid_arguments" } } });
    await expect(searchAlongRoute(db, { category: "fuel", encodedPolyline: "_p~iF~ps|U_", radiusMeters: 5_000 })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(searchAlongRoute(db, { category: "fuel", encodedPolyline: encodePolyline([{ lat: 40, lng: 29 }, { lat: 40, lng: 30 }]), radiusMeters: 5_000 }))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("otomatik tamamlama: sorgu normalize edilir; yeterli sonuç varsa Photon çağrılmaz", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ osm_ref: `n${i}`, kind: i === 0 ? "settlement" : "poi", name: `Göreme ${i}`, subtype: i === 0 ? "town" : "museum", admin: "Nevşehir", lat: 38.6, lng: 34.8 }));
    const { db, rpcCalls } = fakeDb({ search_places: { data: rows } });
    const r = await autocomplete(db, { text: "GÖREME", bias: { lat: 39, lng: 35 } });
    expect(rpcCalls[0].args).toMatchObject({ p_query: "goreme", p_lat: 39, p_lng: 35 });
    expect(r[0]).toEqual({ id: "n0", kind: "settlement", name: "Göreme 0", secondary: "İlçe / Kasaba · Nevşehir", location: { lat: 38.6, lng: 34.8 } });
    expect(calls).toHaveLength(0);
  });

  it("otomatik tamamlama: az sonuçta Photon eklenir; Photon hatası aramayı bozmaz", async () => {
    const { db } = fakeDb({ search_places: { data: [] } });
    responses.push({ status: 200, body: { features: [{ geometry: { coordinates: [29, 41] }, properties: { osm_type: "W", osm_id: 1, street: "Atatürk Caddesi", countrycode: "TR" } }] } });
    const r = await autocomplete(db, { text: "atatürk caddesi" });
    expect(r.map((s) => [s.kind, s.name])).toEqual([["address", "Atatürk Caddesi"]]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("down"); }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await autocomplete(db, { text: "atatürk caddesi" })).toEqual([]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("ters geocoding: etiket yoksa zero_results", async () => {
    const ok = fakeDb({ reverse_geocode: { data: [{ label: "Göreme, Nevşehir Merkez, Nevşehir" }] } });
    expect(await reverseGeocode(ok.db, { lat: 38.64, lng: 34.83 })).toEqual({ label: "Göreme, Nevşehir Merkez, Nevşehir" });
    const none = fakeDb({ reverse_geocode: { data: [{ label: null }] } });
    await expect(reverseGeocode(none.db, { lat: 0, lng: 0 })).rejects.toMatchObject({ code: "zero_results" });
  });
});
