import { describe, expect, it } from "vitest";
import { encodePolyline } from "@/lib/geo";
import { routePreviewPath } from "./route-preview";

describe("routePreviewPath", () => {
  it("rotayı kutuya sığdırır; başlangıç solda, kuzey yukarıda", () => {
    const enc = encodePolyline([{ lat: 41.0, lng: 29.0 }, { lat: 40.0, lng: 31.0 }, { lat: 39.9, lng: 32.8 }]);
    const r = routePreviewPath(enc, 160, 96, 8)!;
    expect(r.d.startsWith("M")).toBe(true);
    for (const [x, y] of [r.start, r.end]) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(160);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(96);
    }
    expect(r.start[0]).toBeLessThan(r.end[0]); // İstanbul batıda
    expect(r.start[1]).toBeLessThan(r.end[1]); // İstanbul kuzeyde (SVG'de y aşağı artar)
  });
  it("çok parçalı iz ve boş giriş", () => {
    const a = encodePolyline([{ lat: 39, lng: 32 }, { lat: 39.1, lng: 32.1 }]);
    const b = encodePolyline([{ lat: 39.2, lng: 32.2 }, { lat: 39.3, lng: 32.3 }]);
    expect(routePreviewPath(`${a} ${b}`)!.d.match(/M/g)).toHaveLength(2);
    expect(routePreviewPath(null)).toBeNull();
    expect(routePreviewPath(encodePolyline([{ lat: 39, lng: 32 }]))).toBeNull();
  });
});
