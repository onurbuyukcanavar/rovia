import { describe, expect, it } from "vitest";
import {
  boundsOf, decodePolyline, distanceToSegment, encodePolyline, haversine, insertionIndexForLegs,
  isValidLatLng, polylineLength, projectOntoPolyline,
} from ".";

const ISTANBUL = { lat: 41.0082, lng: 28.9784 };
const ANKARA = { lat: 39.9334, lng: 32.8597 };

describe("haversine", () => {
  it("İstanbul–Ankara kuş uçuşu ≈ 350 km", () => {
    const d = haversine(ISTANBUL, ANKARA);
    expect(d).toBeGreaterThan(345_000);
    expect(d).toBeLessThan(355_000);
  });
  it("aynı nokta 0", () => expect(haversine(ISTANBUL, ISTANBUL)).toBe(0));
});

describe("polyline", () => {
  it("Google dokümanındaki örneği çözer", () => {
    // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });
  it("encode ↔ decode gidiş-dönüş tutarlı (negatif ve Türkiye koordinatları)", () => {
    const pts = [ISTANBUL, { lat: 40.73, lng: 31.6 }, ANKARA, { lat: -33.86, lng: 151.21 }];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts.map((p) => ({ lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5) })));
  });
  it("bozuk polyline'da hata verir", () => {
    expect(() => decodePolyline("_p~iF~ps|U_")).toThrow("INVALID_POLYLINE");
  });
});

describe("rota geometrisi", () => {
  const path = [{ lat: 40, lng: 30 }, { lat: 40, lng: 31 }, { lat: 40, lng: 32 }];

  it("parçaya dik uzaklık", () => {
    const { distance, t } = distanceToSegment({ lat: 40.01, lng: 30.5 }, path[0], path[1]);
    expect(distance).toBeGreaterThan(1_050);
    expect(distance).toBeLessThan(1_170);
    expect(t).toBeCloseTo(0.5, 2);
  });

  it("rota üzerine iz düşürme: uzaklık + rota boyunca konum", () => {
    const proj = projectOntoPolyline({ lat: 40.02, lng: 31.5 }, path);
    expect(proj.segmentIndex).toBe(1);
    expect(proj.distance).toBeGreaterThan(2_100);
    expect(proj.distance).toBeLessThan(2_350);
    const total = polylineLength(path);
    expect(proj.alongDistance / total).toBeCloseTo(0.75, 2);
  });

  it("rotanın ucundan ötedeki nokta en yakın uca bağlanır", () => {
    const proj = projectOntoPolyline({ lat: 40, lng: 33 }, path);
    expect(proj.segmentIndex).toBe(1);
    expect(proj.alongDistance).toBeCloseTo(polylineLength(path), 0);
  });

  it("yeni durağın ekleneceği sıra bacak mesafelerine göre bulunur", () => {
    const legs = [100_000, 200_000, 50_000]; // 2 ara durak → 3 bacak
    expect(insertionIndexForLegs(10_000, legs)).toBe(0);
    expect(insertionIndexForLegs(150_000, legs)).toBe(1);
    expect(insertionIndexForLegs(320_000, legs)).toBe(2);
    expect(insertionIndexForLegs(999_999, legs)).toBe(2);
    expect(insertionIndexForLegs(5, [42])).toBe(0);
  });

  it("sınır kutusu ve geçerlilik", () => {
    expect(boundsOf(path)).toEqual({ north: 40, south: 40, east: 32, west: 30 });
    expect(boundsOf([])).toBeNull();
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 41, lng: 29 })).toBe(true);
    expect(isValidLatLng(null)).toBe(false);
  });
});
