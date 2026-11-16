import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/geo";
import { GeoError } from "./errors";
import { autocomplete, reverseGeocode, searchAlongRoute } from "./features";
import { searchAddresses } from "./photon";
import { chooseBridge, isEuropeanSide } from "./straits";
import { buildRouteRequest, computeRoute, isAbsurd, MAX_INTERMEDIATES, mergeRoutes, stepKind, toRoute } from "./valhalla";

/** Valhalla yanıtı üretici: noktalar [enlem, boylam], km, dakika */
function trip(points: [number, number][], km: number, min: number, maneuvers: ReturnType<typeof man>[]) {
  return {
    legs: [{ shape: encodePolyline(points.map(([lat, lng]) => ({ lat, lng })), 6), summary: { length: km, time: min * 60 }, maneuvers }],
    summary: { length: km, time: min * 60 },
  };
}
function man(type: number, begin: number, end: number, o: { names?: string[]; instruction?: string; length?: number; time?: number; toll?: boolean; highway?: boolean; ferry?: boolean } = {}) {
  return { type, begin_shape_index: begin, end_shape_index: end, street_names: o.names, instruction: o.instruction ?? "",
    length: o.length ?? 1, time: o.time ?? 60, toll: o.toll, highway: o.highway, ferry: o.ferry };
}

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

  it("istek kipleri: kesin dışlama, serbest (yalnız feribot kesin) ve en kısa", () => {
    const all = { avoidTolls: true, avoidHighways: true, avoidFerries: true };
    expect(buildRouteRequest([IST, ANK], false, all, "strict").costing_options)
      .toEqual({ auto: { exclude_ferries: true, exclude_highways: true, exclude_tolls: true } });
    expect(buildRouteRequest([IST, ANK], false, all, "relaxed").costing_options).toEqual({ auto: { exclude_ferries: true } });
    expect(buildRouteRequest([IST, ANK], false, { ...all, avoidFerries: false }, "relaxed-shortest").costing_options)
      .toEqual({ auto: { use_ferry: 1, shortest: true } });
    expect(buildRouteRequest([IST, ANK], false, { avoidTolls: false, avoidHighways: false, avoidFerries: false }, "plain").costing_options)
      .toEqual({ auto: { use_ferry: 1 } });
  });

  it("manevralar: feribot ücreti ücretli yol değil; yol tarifi adımları ve konumları", () => {
    const r = toRoute(trip([[40.80, 29.43], [40.77, 29.43], [40.69, 29.40], [40.655, 29.276]], 29.6, 61, [
      man(3, 0, 1, { instruction: "güney yönüne doğru sürün.", length: 3.5 }),
      man(28, 1, 2, { instruction: "Eskihisar - Topçular feribotuna binin.", length: 8.5, time: 2400, toll: true, ferry: true }),
      man(29, 2, 3, { instruction: "Feribottan inin.", length: 17.6 }),
      man(4, 3, 3, { instruction: "Varış noktanıza ulaştınız.", length: 0 }),
    ]));
    expect(r).toMatchObject({ hasToll: false, hasFerry: true, hasHighway: false, tollBridges: [] });
    expect(r.steps.map((s) => s.kind)).toEqual(["depart", "ferry", "ferry", "arrive"]);
    expect(r.steps[1]).toMatchObject({ distanceMeters: 8500, durationSeconds: 2400, toll: false, location: { lat: 40.77, lng: 29.43 } });
    expect(stepKind(15)).toBe("left");
    expect(stepKind(26)).toBe("roundabout");
  });

  it("boğaz köprüleri ücretli yol/otoyol sayılmaz (gerçek Valhalla manevraları); diğer ücretli geçişler sayılır", () => {
    // Kadıköy → Beşiktaş: 15 Temmuz Şehitler Köprüsü (yönlendirme tabelasında Avrasya Tüneli de anılıyor)
    const temmuz = toRoute(trip([[40.9905, 29.036], [41.0562, 29.0215]], 14.3, 28, [
      man(20, 0, 1, { names: ["34-11"], toll: true, highway: true, length: 10,
        instruction: "Fikirtepe/Avrasya Tüneli/15 Temmuz Şehitler Köprüsü/Edirne işaretine doğru K-15 çıkıştan çıkın." }),
    ]));
    expect(temmuz).toMatchObject({ hasToll: false, hasHighway: false, tollBridges: ["15 Temmuz Şehitler Köprüsü"] });
    // Sarıyer → Beykoz: FSM (O-2)
    const fsm = toRoute(trip([[41.1011, 29.0007], [41.0911, 29.0878]], 31.6, 56, [
      man(24, 0, 1, { names: ["O-2"], toll: true, highway: true, length: 7.6, instruction: "O-2 üzerinde bulunan K-5 çıkışından çıkın." }),
    ]));
    expect(fsm).toMatchObject({ hasToll: false, hasHighway: false, tollBridges: ["Fatih Sultan Mehmet Köprüsü"] });
    // Lapseki → Gelibolu: 1915 Çanakkale Köprüsü ve gişe kavşağı
    const canakkale = toRoute(trip([[40.3065, 26.652], [40.3695, 26.606], [40.3628, 26.6181]], 28.8, 31, [
      man(24, 0, 1, { names: ["O-6", "E-90"], toll: true, highway: true, length: 10.9, instruction: "1915 Çanakkale Köprüsü işaretine doğru solda kalın." }),
      man(20, 1, 2, { names: ["Gelibolu Güney Kavşağı"], toll: true, length: 1.7, instruction: "Gelibolu (Güney) işaretine doğru çıkın." }),
    ]));
    expect(canakkale).toMatchObject({ hasToll: false, hasHighway: false, tollBridges: ["1915 Çanakkale Köprüsü"] });
    // Avrasya Tüneli, Osmangazi (O-5) ve köprü dışındaki O-6 ücretli kalır
    const avrasya = toRoute(trip([[41.0028, 28.9649], [40.8169, 29.3617]], 41.4, 40, [
      man(24, 0, 1, { names: ["Avrasya Tüneli"], toll: true, length: 41.4, instruction: "Avrasya Tüneli caddesine girin." }),
    ]));
    expect(avrasya).toMatchObject({ hasToll: true, tollBridges: [] });
    const avrasyaShort = toRoute(trip([[41.0, 29.01], [40.99, 29.03]], 3, 4, [
      man(24, 0, 1, { names: ["Avrasya Tüneli"], toll: true, length: 3, instruction: "Avrasya Tüneli." }),
    ]));
    expect(avrasyaShort.hasToll).toBe(true);
    const o5 = toRoute(trip([[40.1932, 28.3525], [40.2894, 29.0192]], 61.8, 40, [
      man(24, 0, 1, { names: ["O-5"], toll: true, highway: true, length: 61.8, instruction: "O-5 caddesine girin." }),
    ]));
    expect(o5).toMatchObject({ hasToll: true, hasHighway: true });
    const o6north = toRoute(trip([[40.6, 26.75], [40.9, 26.9]], 40, 25, [
      man(24, 0, 1, { names: ["O-6"], toll: true, highway: true, length: 40, instruction: "O-6 caddesine girin." }),
    ]));
    expect(o6north).toMatchObject({ hasToll: true, hasHighway: true });
  });

  it("üç kaçınma birden: anlamsız dolambaç reddedilir, boğaz köprüsü üzerinden zorlanan rota kurulur", async () => {
    const TEKIRDAG = { lat: 40.978, lng: 27.511 };
    const BURSA = { lat: 40.195, lng: 29.06 };
    const modes: string[] = [];
    const req = async (points: { lat: number; lng: number }[], _alt: boolean, _o: unknown, mode: string) => {
      modes.push(`${mode}:${points.length}`);
      if (mode === "strict" && points[0] === TEKIRDAG && points[1] === BURSA) {
        // Kazakistan üzerinden 15.718 km (gerçek gözlem)
        return [trip([[40.978, 27.511], [45, 60], [40.195, 29.06]], 15718, 14528 * 60 / 60, [])];
      }
      if (mode === "relaxed" || mode === "relaxed-shortest") {
        if (points.length === 2 && points[0] === TEKIRDAG) {
          return [trip([[40.978, 27.511], [40.2894, 29.0192]], 372, 336, [
            man(24, 0, 1, { names: ["Avrasya Tüneli"], toll: true, length: 41, instruction: "Avrasya Tüneli." }),
          ])];
        }
        // Köprü geçişi (15 Temmuz)
        return [trip([[41.0612, 29.0058], [41.0228, 29.0482]], 6, 8, [
          man(23, 0, 1, { names: ["O-1"], toll: true, highway: true, length: 5.1, instruction: "15 Temmuz Şehitler Köprüsü/Edirne işaretine doğru sağda kalın." }),
        ])];
      }
      // Kesin parçalar: Tekirdağ → köprü (Avrupa) ve köprü (Anadolu) → Bursa (körfez çevresinden, D-100/D-130)
      if (mode === "strict" && points[0] === TEKIRDAG) return [trip([[40.978, 27.511], [41.0612, 29.0058]], 135, 120, [man(1, 0, 0, { length: 135 })])];
      return [trip([[41.0228, 29.0482], [40.195, 29.06]], 190, 200, [man(4, 1, 1, { length: 0 })])];
    };
    const all = { avoidTolls: true, avoidHighways: true, avoidFerries: true };
    const r = await computeRoute([TEKIRDAG, BURSA], true, all, req as never);
    expect(modes).toEqual(["strict:2", "relaxed:2", "relaxed-shortest:2", "strict:2", "strict:2", "relaxed:2"]);
    expect(r.routes).toHaveLength(1);
    expect(r.routes[0]).toMatchObject({
      distanceMeters: 331_000, hasToll: false, hasHighway: false, hasFerry: false, tollBridges: ["15 Temmuz Şehitler Köprüsü"],
    });
    expect(r.routes[0].legs).toHaveLength(1);
    // Yol tarifinde ara parçaların varış/çıkış adımları tekrarlanmaz
    expect(r.routes[0].steps.filter((s) => s.kind === "depart" || s.kind === "arrive")).toHaveLength(2);
  });

  it("uygun aday yoksa: no_suitable_route ve Türkçe mesaj", async () => {
    const A = { lat: 39.92, lng: 32.85 };
    const B = { lat: 38.643, lng: 34.829 };
    const req = async () => [trip([[39.92, 32.85], [55, 80], [38.643, 34.829]], 9000, 9000, [
      man(24, 0, 1, { names: ["O-21"], toll: true, highway: true, length: 100 }),
    ])];
    const err = await computeRoute([A, B], true, { avoidTolls: true, avoidHighways: true, avoidFerries: true }, req as never).catch((e) => e);
    expect(err).toBeInstanceOf(GeoError);
    expect(err.code).toBe("no_suitable_route");
    expect(err.userMessage).toMatch(/^Uygun rota bulunamamaktadır/);
  });

  it("ücretli yoldan kaçın (feribot serbest): ücretsiz 116 km + feribotlu rota; köprülü rota elenir", async () => {
    const G = { lat: 40.8027, lng: 29.4307 };
    const Y = { lat: 40.655, lng: 29.276 };
    const req = async (_p: unknown, _a: boolean, _o: unknown, mode: string) => mode === "strict"
      ? [trip([[40.8, 29.43], [40.75, 29.9], [40.655, 29.276]], 116.6, 96, [])]
      : [
        trip([[40.8, 29.43], [40.655, 29.276]], 40.1, 40, [man(23, 0, 1, { names: ["O-5"], toll: true, highway: true, length: 9 })]),
        trip([[40.8, 29.43], [40.77, 29.43], [40.655, 29.276]], 29.6, 61, [man(28, 1, 2, { toll: true, ferry: true, length: 8.5 })]),
      ];
    const r = await computeRoute([G, Y], true, { avoidTolls: true, avoidHighways: false, avoidFerries: false }, req as never);
    expect(r.routes.map((x) => [Math.round(x.distanceMeters / 100) / 10, x.hasFerry, x.hasToll])).toEqual([[29.6, true, false], [116.6, false, false]]);
  });

  it("benzer rotalar tekilleşir", () => {
    const base = { encodedPolyline: "", legs: [], hasToll: false, hasFerry: false, hasHighway: false, tollBridges: [], steps: [] };
    const merged = mergeRoutes([[{ ...base, distanceMeters: 100_000, durationSeconds: 4000 }],
      [{ ...base, distanceMeters: 100_500, durationSeconds: 4010 }, { ...base, distanceMeters: 90_000, durationSeconds: 5000 }]]);
    expect(merged.map((m) => m.distanceMeters)).toEqual([100_000, 90_000]);
  });

  it("yaka sınıflaması ve köprü seçimi", () => {
    const eu = (lat: number, lng: number) => isEuropeanSide({ lat, lng });
    // Avrupa: Beşiktaş, Bakırköy, Sarıyer, Tekirdağ, Edirne, Gelibolu, Eceabat
    expect([eu(41.043, 29.007), eu(40.978, 28.873), eu(41.168, 29.05), eu(40.978, 27.511), eu(41.67, 26.56), eu(40.41, 26.67), eu(40.184, 26.357)])
      .toEqual([true, true, true, true, true, true, true]);
    // Anadolu: Kadıköy, Üsküdar, Beykoz, Gebze, Yalova, Bursa, Çanakkale, Lapseki, Ankara
    expect([eu(40.99, 29.028), eu(41.026, 29.015), eu(41.13, 29.1), eu(40.8, 29.43), eu(40.655, 29.276), eu(40.195, 29.06), eu(40.146, 26.405), eu(40.344, 26.685), eu(39.92, 32.85)])
      .toEqual([false, false, false, false, false, false, false, false, false]);
    expect(chooseBridge({ lat: 40.978, lng: 27.511 }, { lat: 40.195, lng: 29.06 }).bridge.id).toBe("15temmuz");
    expect(chooseBridge({ lat: 41.168, lng: 29.05 }, { lat: 41.13, lng: 29.1 }).bridge.id).toBe("fsm");
    expect(chooseBridge({ lat: 40.184, lng: 26.357 }, { lat: 39.6, lng: 27.0 }).bridge.id).toBe("canakkale1915");
  });

  it("anlamsız dolambaç ölçütü", () => {
    const base = { encodedPolyline: "", legs: [], hasToll: false, hasFerry: false, hasHighway: false, tollBridges: [], steps: [] };
    const gebzeYalova = [{ lat: 40.8027, lng: 29.4307 }, { lat: 40.655, lng: 29.276 }];
    expect(isAbsurd({ ...base, distanceMeters: 116_600, durationSeconds: 1 }, gebzeYalova)).toBe(false);
    const tekirdagBursa = [{ lat: 40.978, lng: 27.511 }, { lat: 40.195, lng: 29.06 }];
    expect(isAbsurd({ ...base, distanceMeters: 6_436_000, durationSeconds: 1 }, tekirdagBursa)).toBe(true);
    expect(isAbsurd({ ...base, distanceMeters: 331_000, durationSeconds: 1 }, tekirdagBursa)).toBe(false);
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
    // Yalnızca bir bölgede aday varsa aynı yerden doldurulmaz
    expect(spreadAlongRoute(cands.slice(0, 3), 450_000, 4).map((p) => p.id)).toEqual(["a1"]);
    expect([suggestionRadius(20_000), suggestionRadius(120_000), suggestionRadius(800_000)]).toEqual([1_500, 3_000, 5_000]);
  });
});

describe("çok uzun rota", () => {
  it("yüz binlerce noktalı rota yığını taşırmadan birleştirilir", async () => {
    const { toRoute } = await import("./valhalla");
    const pts = Array.from({ length: 300_000 }, (_, i) => ({ lat: 40 + i * 1e-5, lng: 27 + i * 1e-5 }));
    const r = toRoute({ legs: [{ shape: encodePolyline(pts, 6), summary: { length: 15718, time: 871680 }, maneuvers: [] }], summary: { length: 15718, time: 871680 } });
    expect(r.distanceMeters).toBe(15_718_000);
  });
});
