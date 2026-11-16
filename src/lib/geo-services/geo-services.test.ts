import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/geo";
import { GeoError } from "./errors";
import { autocomplete, reverseGeocode, searchAlongRoute } from "./features";
import { searchAddresses } from "./photon";
import { buildRouteRequest, computeRoute, MAX_INTERMEDIATES, mergeRoutes, stepKind, toRoute } from "./valhalla";

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
    expect(two).toMatchObject({
      costing: "auto", units: "kilometers", language: "tr-TR", directions_type: "instructions", alternates: 2,
      // Feribotlar cezasız: Eskihisar–Topçular gibi seçenekler rota/alternatif olabilsin
      costing_options: { auto: { use_ferry: 1 } },
    });
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

  it("seçenekler: kaçınmalar kesin dışlama; feribottan kaçınınca use_ferry yok", () => {
    expect(buildRouteRequest([IST, ANK], false, { avoidTolls: false, avoidHighways: true, avoidFerries: true }).costing_options)
      .toEqual({ auto: { exclude_ferries: true, exclude_highways: true } });
    expect(buildRouteRequest([IST, ANK], false, { avoidTolls: true, avoidHighways: false, avoidFerries: false }, "exclude").costing_options)
      .toEqual({ auto: { use_ferry: 1, exclude_tolls: true } });
    expect(buildRouteRequest([IST, ANK], false, { avoidTolls: true, avoidHighways: false, avoidFerries: false }, "soft").costing_options)
      .toEqual({ auto: { use_ferry: 1, use_tolls: 0 } });
  });

  it("manevralar: feribot ücreti 'ücretli yol' sayılmaz; yol tarifi adımları ve konumları", () => {
    const shape = encodePolyline([{ lat: 40.80, lng: 29.43 }, { lat: 40.77, lng: 29.43 }, { lat: 40.69, lng: 29.40 }, { lat: 40.655, lng: 29.276 }], 6);
    const r = toRoute({
      legs: [{ shape, summary: { length: 29.6, time: 3660 }, maneuvers: [
        { type: 3, instruction: "güney yönüne doğru sürün.", length: 3.5, time: 300, begin_shape_index: 0 },
        { type: 28, instruction: "Eskihisar - Topçular feribotuna binin.", length: 8.5, time: 2400, begin_shape_index: 1, toll: true, ferry: true },
        { type: 29, instruction: "Feribottan inin.", length: 17.6, time: 960, begin_shape_index: 2 },
        { type: 4, instruction: "Varış noktanıza ulaştınız.", length: 0, time: 0, begin_shape_index: 3 },
      ] }],
      summary: { length: 29.6, time: 3660, has_toll: true, has_ferry: true, has_highway: false },
    });
    expect(r).toMatchObject({ hasToll: false, hasFerry: true, hasHighway: false });
    expect(r.steps.map((s) => s.kind)).toEqual(["depart", "ferry", "ferry", "arrive"]);
    expect(r.steps[1]).toMatchObject({ distanceMeters: 8500, durationSeconds: 2400, toll: false, location: { lat: 40.77, lng: 29.43 } });

    const bridge = toRoute({
      legs: [{ shape, summary: { length: 39.3, time: 2100 }, maneuvers: [
        { type: 23, instruction: "Osmangazi Köprüsü'ne doğru sağda kalın.", length: 12, time: 500, begin_shape_index: 1, toll: true, highway: true },
      ] }],
      summary: { length: 39.3, time: 2100, has_toll: true, has_ferry: false, has_highway: true },
    });
    expect(bridge).toMatchObject({ hasToll: true, hasFerry: false });
    expect(stepKind(15)).toBe("left");
    expect(stepKind(26)).toBe("roundabout");
  });

  it("ücretli yollardan kaçın (feribot serbest): kesin ücretsiz + feribotlu rota birleştirilir, köprülü rota elenir", async () => {
    const shape = encodePolyline([IST, ANK], 6);
    const trip = (km: number, min: number, maneuvers: object[]) => ({
      legs: [{ shape, summary: { length: km, time: min * 60 }, maneuvers }],
      summary: { length: km, time: min * 60, has_toll: maneuvers.length > 0, has_ferry: false, has_highway: false },
    });
    // 1. istek (exclude_tolls): 116 km'lik dolambaçlı ücretsiz yol
    responses.push({ status: 200, body: { trip: trip(116.6, 96, []) } });
    // 2. istek (use_tolls=0): köprü (ücretli) + feribot
    responses.push({ status: 200, body: {
      trip: trip(40.1, 40, [{ type: 23, length: 9, time: 400, begin_shape_index: 0, toll: true }]),
      alternates: [{ trip: trip(29.6, 61, [{ type: 28, length: 8.5, time: 2400, begin_shape_index: 0, toll: true, ferry: true }]) }],
    } });
    const r = await computeRoute([IST, ANK], true, { avoidTolls: true, avoidHighways: false, avoidFerries: false });
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0].init.body)).costing_options.auto).toMatchObject({ exclude_tolls: true });
    expect(JSON.parse(String(calls[1].init.body)).costing_options.auto).toMatchObject({ use_tolls: 0, use_ferry: 1 });
    expect(r.routes.map((x) => [Math.round(x.distanceMeters / 100) / 10, x.hasFerry, x.hasToll])).toEqual([[29.6, true, false], [116.6, false, false]]);
  }, 10_000);

  it("ücretli yol + feribottan kaçın: tek istek; benzer rotalar tekilleşir", async () => {
    responses.push({ status: 200, body: { trip: { legs: [{ shape: encodePolyline([IST, ANK], 6), summary: { length: 450, time: 16000 } }], summary: { length: 450, time: 16000 } } } });
    await computeRoute([IST, ANK], true, { avoidTolls: true, avoidHighways: false, avoidFerries: true });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init.body)).costing_options.auto).toEqual({ exclude_ferries: true, exclude_tolls: true });

    const base = { encodedPolyline: "", legs: [], hasToll: false, hasFerry: false, hasHighway: false, steps: [] };
    const merged = mergeRoutes([[{ ...base, distanceMeters: 100_000, durationSeconds: 4000 }],
      [{ ...base, distanceMeters: 100_500, durationSeconds: 4010 }, { ...base, distanceMeters: 90_000, durationSeconds: 5000 }]]);
    expect(merged.map((m) => m.distanceMeters)).toEqual([100_000, 90_000]);
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

describe("rota önerilerinin dağıtılması", () => {
  it("rota parçalarının her birinden en iyisi; kümelenme önlenir; yolculuk sırasında döner", async () => {
    const { spreadAlongRoute, suggestionRadius } = await import("./features");
    const c = (id: string, along: number, score: number) => ({ id, alongRoute: along, score });
    // İstanbul çıkışında 5 güçlü yer, yolun geri kalanında birer tane
    const cands = [c("a1", 1_000, 0.5), c("a2", 2_000, 0.49), c("a3", 3_000, 0.48), c("a4", 4_000, 0.47), c("a5", 5_000, 0.46),
      c("b", 150_000, 0.2), c("c", 250_000, 0.25), c("d", 420_000, 0.3)];
    const picked = spreadAlongRoute(cands, 450_000, 4);
    expect(picked.map((p) => p.id)).toEqual(["a1", "b", "c", "d"]);
    expect(spreadAlongRoute(cands.slice(0, 3), 450_000, 4).map((p) => p.id)).toEqual(["a1", "a2", "a3"]);
    expect([suggestionRadius(20_000), suggestionRadius(120_000), suggestionRadius(800_000)]).toEqual([1_500, 3_000, 5_000]);
  });
});
