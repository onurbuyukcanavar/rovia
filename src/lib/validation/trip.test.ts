import { describe, expect, it } from "vitest";
import { encodePolyline } from "@/lib/geo";
import { formatDuration } from "@/lib/format";
import { tripPlanSchema, type TripPlanInput } from "./trip";

const stop = (name: string, lat: number, lng: number) => ({ name, address: null, lat, lng, ref: null });
const valid: TripPlanInput = {
  id: null,
  version: null,
  title: "  İstanbul – Kapadokya  ",
  description: "",
  plannedDate: "2026-12-05",
  stops: [stop("İstanbul", 41, 29), stop("Göreme", 38.6, 34.8)],
  route: {
    encodedPolyline: encodePolyline([{ lat: 41, lng: 29 }, { lat: 38.6, lng: 34.8 }]),
    distanceMeters: 733_000,
    durationSeconds: 30_000,
    legs: [{ distanceMeters: 733_000, durationSeconds: 30_000 }],
    hasToll: true,
    hasFerry: false,
  },
};

describe("tripPlanSchema", () => {
  it("geçerli planı kabul eder, boşlukları kırpar, boş açıklamayı null yapar", () => {
    const r = tripPlanSchema.parse(valid);
    expect(r.title).toBe("İstanbul – Kapadokya");
    expect(r.description).toBeNull();
  });

  it("boş ad ve uzun ad Türkçe mesajla reddedilir", () => {
    expect(tripPlanSchema.safeParse({ ...valid, title: "   " }).error?.issues[0].message).toBe("Yolculuğa bir ad ver.");
    expect(tripPlanSchema.safeParse({ ...valid, title: "x".repeat(161) }).success).toBe(false);
  });

  it("gerçek olmayan ve aralık dışı tarihleri reddeder, boş tarihi kabul eder", () => {
    for (const d of ["2026-02-30", "2026-13-01", "1999-12-31", "2101-01-01", "05.12.2026"]) {
      expect(tripPlanSchema.safeParse({ ...valid, plannedDate: d }).success, d).toBe(false);
    }
    expect(tripPlanSchema.parse({ ...valid, plannedDate: "" }).plannedDate).toBeNull();
    expect(tripPlanSchema.parse({ ...valid, plannedDate: "2028-02-29" }).plannedDate).toBe("2028-02-29");
  });

  it("rota durak sayısıyla uyuşmazsa veya çözülemezse reddedilir; rotasız kayıt geçerlidir", () => {
    const stops = [...valid.stops, stop("Ankara", 39.9, 32.8)];
    expect(tripPlanSchema.safeParse({ ...valid, stops }).success).toBe(false);
    expect(tripPlanSchema.safeParse({ ...valid, route: { ...valid.route!, encodedPolyline: "??" } }).success).toBe(false);
    expect(tripPlanSchema.safeParse({ ...valid, stops, route: null }).success).toBe(true);
  });

  it("id ve sürüm birlikte gelmeli; durak sayısı 2–20", () => {
    expect(tripPlanSchema.safeParse({ ...valid, id: "8d7b6c1e-3f0a-4e7b-9a52-1c2d3e4f5a6b" }).success).toBe(false);
    expect(tripPlanSchema.safeParse({ ...valid, id: "8d7b6c1e-3f0a-4e7b-9a52-1c2d3e4f5a6b", version: 3 }).success).toBe(true);
    expect(tripPlanSchema.safeParse({ ...valid, stops: [valid.stops[0]], route: null }).success).toBe(false);
    expect(tripPlanSchema.safeParse({ ...valid, stops: Array.from({ length: 21 }, () => valid.stops[0]), route: null }).success).toBe(false);
  });

  it("geçersiz OSM referansı reddedilir", () => {
    expect(tripPlanSchema.safeParse({ ...valid, stops: [{ ...valid.stops[0], ref: "x1" }, valid.stops[1]] }).success).toBe(false);
  });
});

describe("formatDuration", () => {
  it("dakika yuvarlaması saati taşırmaz", () => {
    expect(formatDuration(3599)).toBe("1 sa");
    expect(formatDuration(7199)).toBe("2 sa");
    expect(formatDuration(3660)).toBe("1 sa 1 dk");
    expect(formatDuration(20)).toBe("1 dk");
    expect(formatDuration(0)).toBe("0 dk");
  });
});
