import { describe, expect, it } from "vitest";
import {
  MAX_WAYPOINTS, explorerReducer, initialExplorerState, routeRequest, routeRequestKey, type ExplorerState,
} from "./explorer-state";
import type { Stop } from "./types";

const stop = (label: string, lat = 40, lng = 30, placeId: string | null = null): Stop => ({
  id: label, label, address: null, placeId, location: { lat, lng },
});

const ist = stop("İstanbul", 41.0, 28.97, "ChIJ_istanbul_0");
const bolu = stop("Bolu", 40.73, 31.6);
const ank = stop("Ankara", 39.93, 32.85, "ChIJ_ankara_000");
const gor = stop("Göreme", 38.64, 34.83, "ChIJ_goreme_000");

function build(): ExplorerState {
  let s = initialExplorerState();
  s = explorerReducer(s, { type: "set", slot: { kind: "origin" }, stop: ist });
  s = explorerReducer(s, { type: "set", slot: { kind: "destination" }, stop: gor });
  s = explorerReducer(s, { type: "addWaypoint", key: "w1", stop: bolu });
  s = explorerReducer(s, { type: "addWaypoint", key: "w2", stop: ank });
  return s;
}

describe("rota kurucusu durumu", () => {
  it("İstanbul → Bolu → Ankara → Göreme isteği oluşturur", () => {
    const req = routeRequest(build())!;
    expect([req.origin, ...req.waypoints, req.destination].map((s) => s.label)).toEqual(["İstanbul", "Bolu", "Ankara", "Göreme"]);
  });

  it("boş ara durak varken rota istenmez", () => {
    const s = explorerReducer(build(), { type: "addWaypoint", key: "w3" });
    expect(routeRequest(s)).toBeNull();
    expect(routeRequestKey(s)).toBeNull();
  });

  it("durak sırası değiştirilir; sınırlar korunur", () => {
    let s = explorerReducer(build(), { type: "moveWaypoint", key: "w2", delta: -1 });
    expect(s.waypoints.map((w) => w.stop?.label)).toEqual(["Ankara", "Bolu"]);
    s = explorerReducer(s, { type: "moveWaypoint", key: "w2", delta: -1 });
    expect(s.waypoints.map((w) => w.stop?.label)).toEqual(["Ankara", "Bolu"]);
  });

  it("durak silinir ve araya ekleme indeksine göre yapılır", () => {
    let s = explorerReducer(build(), { type: "removeWaypoint", key: "w1" });
    expect(s.waypoints.map((w) => w.stop?.label)).toEqual(["Ankara"]);
    s = explorerReducer(s, { type: "addWaypoint", key: "w9", stop: bolu, index: 0 });
    expect(s.waypoints.map((w) => w.stop?.label)).toEqual(["Bolu", "Ankara"]);
  });

  it("başlangıç ve varış yer değiştirince ara duraklar da ters çevrilir", () => {
    const s = explorerReducer(build(), { type: "swapEnds" });
    const req = routeRequest(s)!;
    expect([req.origin, ...req.waypoints, req.destination].map((x) => x.label)).toEqual(["Göreme", "Ankara", "Bolu", "İstanbul"]);
  });

  it("en fazla 25 ara durak", () => {
    let s = initialExplorerState();
    for (let i = 0; i < MAX_WAYPOINTS + 3; i++) s = explorerReducer(s, { type: "addWaypoint", key: `k${i}`, stop: bolu });
    expect(s.waypoints).toHaveLength(MAX_WAYPOINTS);
  });

  it("durak değişince seçili alternatif sıfırlanır; istek anahtarı trafik tercihini içerir", () => {
    let s = explorerReducer(build(), { type: "selectRoute", index: 2 });
    expect(s.selectedRoute).toBe(2);
    const k1 = routeRequestKey(s);
    s = explorerReducer(s, { type: "setTrafficAware", value: true });
    expect(s.selectedRoute).toBe(0);
    expect(routeRequestKey(s)).not.toBe(k1);
    expect(routeRequestKey(s)).toContain("ChIJ_istanbul_0");
  });
});
