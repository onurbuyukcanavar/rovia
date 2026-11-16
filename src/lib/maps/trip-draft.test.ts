import { describe, expect, it } from "vitest";
import { explorerReducer } from "./explorer-state";
import { closestRouteIndex, orderedStops, planFingerprint, shortPlaceName, stateFromStops } from "./trip-draft";
import type { RouteOption, Stop } from "./types";

const stop = (id: string, lat: number, lng: number, label = id): Stop => ({ id, label, address: null, ref: null, location: { lat, lng } });
const A = stop("a", 41, 29, "İstanbul");
const B = stop("b", 40.7, 31.6, "Bolu");
const C = stop("c", 39.9, 32.8, "Ankara");
const D = stop("d", 38.6, 34.8, "Göreme");
const fields = { title: "Kapadokya", description: "", plannedDate: "" };
const route = (d: number): RouteOption => ({ distanceMeters: d, durationSeconds: 1, encodedPolyline: "", legs: [], hasToll: false, hasFerry: false, hasHighway: false });

describe("stateFromStops / orderedStops", () => {
  it("kaydedilmiş sırayı aynen geri kurar", () => {
    const s = stateFromStops([A, B, C, D]);
    expect(s.origin.stop).toBe(A);
    expect(s.destination.stop).toBe(D);
    expect(s.waypoints.map((w) => w.stop)).toEqual([B, C]);
    expect(orderedStops(s)).toEqual([A, B, C, D]);
  });

  it("ara durak taşınınca sıra değişir; boş durak varken kaydedilemez", () => {
    let s = stateFromStops([A, B, C, D]);
    s = explorerReducer(s, { type: "moveWaypoint", key: s.waypoints[1].key, delta: -1 });
    expect(orderedStops(s)?.map((x) => x.label)).toEqual(["İstanbul", "Ankara", "Bolu", "Göreme"]);
    s = explorerReducer(s, { type: "addWaypoint", key: "new" });
    expect(orderedStops(s)).toBeNull();
  });

  it("varış yoksa null", () => {
    expect(orderedStops(stateFromStops([A]))).toBeNull();
  });
});

describe("planFingerprint", () => {
  it("aynı plan aynı izi verir; durak kimliği değişse de konum aynıysa değişiklik yok", () => {
    const s1 = stateFromStops([A, D]);
    const s2 = stateFromStops([{ ...A, id: "x" }, D]);
    expect(planFingerprint(fields, s1, 100)).toBe(planFingerprint({ ...fields, title: " Kapadokya " }, s2, 100));
  });

  it("ad, tarih, durak, sıra veya seçili rota değişince iz değişir", () => {
    const base = planFingerprint(fields, stateFromStops([A, B, C, D]), 100);
    expect(planFingerprint({ ...fields, title: "Başka" }, stateFromStops([A, B, C, D]), 100)).not.toBe(base);
    expect(planFingerprint({ ...fields, plannedDate: "2026-12-01" }, stateFromStops([A, B, C, D]), 100)).not.toBe(base);
    expect(planFingerprint(fields, stateFromStops([A, C, B, D]), 100)).not.toBe(base);
    expect(planFingerprint(fields, stateFromStops([A, B, D]), 100)).not.toBe(base);
    expect(planFingerprint(fields, stateFromStops([A, B, C, D]), 120)).not.toBe(base);
  });
});

describe("closestRouteIndex", () => {
  it("kaydedilmiş mesafeye en yakın alternatifi seçer", () => {
    expect(closestRouteIndex([route(450_000), route(470_000), route(520_000)], 471_200)).toBe(1);
    expect(closestRouteIndex([route(450_000)], 471_200)).toBe(0);
    expect(closestRouteIndex([route(450_000), route(470_000)], null)).toBe(0);
  });
});

describe("shortPlaceName", () => {
  it("adresin ilk parçasını ve konum önekini temizler", () => {
    expect(shortPlaceName("Konumum · Alemdar, Fatih, İstanbul")).toBe("Alemdar");
    expect(shortPlaceName("Ankara")).toBe("Ankara");
    expect(shortPlaceName("Göreme, Nevşehir Merkez, Nevşehir")).toBe("Göreme");
  });
});
