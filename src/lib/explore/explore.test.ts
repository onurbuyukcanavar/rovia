import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, DEFAULT_CATEGORY, EXPLORE_CATEGORY_KEYS, isExploreCategory, maxAreaFor } from "./categories";
import { bboxAround, bboxArea, isValidBbox, normalizeBbox, osmUrl, parseKonum, safeUrl, wikidataUrl, wikipediaUrl } from "./geo";
import { placeToSearchParams, stopFromSearchParams, wantsCurrentOrigin } from "./place-param";
import { stateFromStops, withInsertedStop } from "@/lib/maps/trip-draft";
import { encodePolyline } from "@/lib/geo";
import { explore } from "@/i18n/explore";
import type { Stop } from "@/lib/maps/types";

describe("kategoriler", () => {
  it("15 kategori, hepsinin etiketi ve rengi var; varsayılan öne çıkanlar", () => {
    expect(EXPLORE_CATEGORY_KEYS).toHaveLength(15);
    expect(DEFAULT_CATEGORY).toBe("featured");
    for (const k of EXPLORE_CATEGORY_KEYS) {
      expect(explore.categories[k]).toBeTruthy();
      expect(CATEGORY_COLORS[k]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(explore.categories.featured).toBe("Öne çıkanlar");
  });
  it("kategori doğrulama ve alan sınırı", () => {
    expect(isExploreCategory("castle")).toBe(true);
    expect(isExploreCategory("fuel")).toBe(false);
    expect(isExploreCategory(undefined)).toBe(false);
    expect(maxAreaFor("featured")).toBe(200);
    expect(maxAreaFor("lake")).toBe(40);
  });
});

describe("kaynak bağlantıları", () => {
  it("osm_ref → OSM adresi", () => {
    expect(osmUrl("n123")).toBe("https://www.openstreetmap.org/node/123");
    expect(osmUrl("w456")).toBe("https://www.openstreetmap.org/way/456");
    expect(osmUrl("r789")).toBe("https://www.openstreetmap.org/relation/789");
    expect(osmUrl("x1")).toBeNull();
    expect(osmUrl("n12a")).toBeNull();
  });
  it("wikidata / wikipedia / web sitesi", () => {
    expect(wikidataUrl("Q1234")).toBe("https://www.wikidata.org/wiki/Q1234");
    expect(wikidataUrl("javascript:alert(1)")).toBeNull();
    expect(wikipediaUrl("tr:Uçhisar Kalesi")).toBe(`https://tr.wikipedia.org/wiki/${encodeURIComponent("Uçhisar_Kalesi")}`);
    expect(wikipediaUrl("Kale")).toBeNull();
    expect(safeUrl("example.com")?.hostname).toBe("example.com");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("bbox yardımcıları", () => {
  it("alan, doğrulama ve normalleştirme", () => {
    expect(bboxArea([30, 36, 40, 40])).toBe(40);
    expect(isValidBbox([30, 36, 40, 40])).toBe(true);
    expect(isValidBbox([40, 36, 30, 40])).toBe(false);
    expect(normalizeBbox([-200, 36.12345, 40.98765, 95])).toEqual([-180, 36.123, 40.988, 90]);
  });
  it("noktanın çevresinde kutu (25 km ≈ 0.22° enlem)", () => {
    const b = bboxAround({ lat: 39, lng: 35 }, 25);
    expect(b[3] - b[1]).toBeCloseTo(0.449, 2);
    expect(b[2] - b[0]).toBeGreaterThan(b[3] - b[1]);
    expect(bboxArea(b)).toBeLessThan(40);
  });
  it("konum parametresi", () => {
    expect(parseKonum("38.64,34.83,11")).toEqual({ lat: 38.64, lng: 34.83, zoom: 11 });
    expect(parseKonum("38.64,34.83")).toEqual({ lat: 38.64, lng: 34.83, zoom: 11 });
    expect(parseKonum("100,34")).toBeNull();
    expect(parseKonum("abc")).toBeNull();
    expect(parseKonum(null)).toBeNull();
  });
});

describe("yer parametresi (Keşfet → planlayıcı)", () => {
  it("gidiş-dönüş", () => {
    const q = new URLSearchParams(placeToSearchParams({ ref: "w42", name: "Uçhisar Kalesi", lat: 38.63, lng: 34.805, address: "Nevşehir" }));
    const stop = stopFromSearchParams(Object.fromEntries(q));
    expect(stop).toMatchObject({ id: "w42", ref: "w42", label: "Uçhisar Kalesi", address: "Nevşehir", location: { lat: 38.63, lng: 34.805 } });
  });
  it("geçersiz girdiler", () => {
    expect(stopFromSearchParams({ ad: "X" })).toBeNull();
    expect(stopFromSearchParams({ ad: "X", konum: "99,1" })).toBeNull();
    expect(stopFromSearchParams({ ad: "X", konum: "1,1", yer: "bad" })?.ref).toBeNull();
  });
  it("paylaşılan konum: OSM kaydı olmayan nokta + başlangıç = cihaz konumu", () => {
    const q = new URLSearchParams(placeToSearchParams({ ref: null, name: "Galata Kulesi", lat: 41.0256, lng: 28.974117, address: null }, { fromCurrentLocation: true }));
    expect(q.get("konum")).toBe("41.025600,28.974117");
    expect(q.get("baslangic")).toBe("konum");
    expect(q.has("yer")).toBe(false);
    const params = Object.fromEntries(q);
    expect(stopFromSearchParams(params)).toMatchObject({ id: "p41.02560,28.97412", ref: null, label: "Galata Kulesi", location: { lat: 41.0256, lng: 28.974117 } });
    expect(wantsCurrentOrigin(params)).toBe(true);
    expect(wantsCurrentOrigin({ baslangic: ["konum", "x"] })).toBe(false);
    expect(wantsCurrentOrigin({})).toBe(false);
  });
});

describe("withInsertedStop", () => {
  const s = (id: string, lat: number, lng: number): Stop => ({ id, label: id, address: null, ref: null, location: { lat, lng } });
  const a = s("A", 39, 30), m = s("M", 39, 32), b = s("B", 39, 34);
  const route = {
    encodedPolyline: encodePolyline([a.location, m.location, b.location]),
    distanceMeters: 345_000, durationSeconds: 14_000, hasToll: false, hasFerry: false, hasHighway: true,
    legs: [{ distanceMeters: 172_500, durationSeconds: 7_000 }, { distanceMeters: 172_500, durationSeconds: 7_000 }],
  };
  it("rota boyunca doğru sıraya ekler", () => {
    const base = stateFromStops([a, m, b]);
    const early = withInsertedStop(base, s("E", 39.01, 31), route);
    expect(early.inserted).toBe(true);
    expect(early.state.waypoints.map((w) => w.stop?.id)).toEqual(["E", "M"]);
    const late = withInsertedStop(base, s("L", 39.01, 33), route);
    expect(late.state.waypoints.map((w) => w.stop?.id)).toEqual(["M", "L"]);
  });
  it("rota yoksa varıştan önce; aynı yer tekrar eklenmez", () => {
    const base = stateFromStops([a, b]);
    expect(withInsertedStop(base, s("X", 40, 32), null).state.waypoints.map((w) => w.stop?.id)).toEqual(["X"]);
    expect(withInsertedStop(base, s("A2", 39, 30), null)).toMatchObject({ inserted: false, reason: "duplicate" });
  });
});
