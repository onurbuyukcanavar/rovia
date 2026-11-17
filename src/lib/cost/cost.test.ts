import { describe, expect, it } from "vitest";
import type { RouteStep } from "@/lib/maps/types";
import { estimateRangeKm, estimateTripCost } from "./estimate";
import { formatDecimalTR, parseDecimalTR } from "./parse";
import { detectRouteTolls, ferryName, motorwayNames, tollsForSavedTrip } from "./tolls";
import { readAssumptions, readFuelPrices } from "./types";

const base = { distanceM: 100_000, consumptionPer100: 6.4, fuelType: "gasoline" as const, fuelPrice: 50, tollItems: [] };

describe("parseDecimalTR", () => {
  it.each([
    ["6,4", 6.4], ["6.4", 6.4], ["50", 50], [" 47,85 ", 47.85], ["1.234,5", 1234.5], ["1,234.5", 1234.5],
    ["1.250", 1250], ["12.345.678", 12345678], ["0,5", 0.5], ["50 TL", 50], ["6,4 L", 6.4],
  ])("%s → %s", (s, n) => expect(parseDecimalTR(s)).toBe(n));
  it.each(["", "  ", "abc", "6,4,1", "1.2.3", "6,4x", null, undefined])("%s → null", (s) => expect(parseDecimalTR(s as string)).toBeNull());
  it("biçimler", () => {
    expect(formatDecimalTR(6.4)).toBe("6,4");
    expect(formatDecimalTR(1250)).toBe("1250");
    expect(formatDecimalTR(null)).toBe("");
  });
});

describe("estimateTripCost", () => {
  it("100 km, 6,4 L/100 km, 50 TL/L → 6,4 L ≈ 320 TL", () => {
    const r = estimateTripCost(base);
    expect(r).toMatchObject({ energy: 6.4, unit: "L", fuelCost: 320, tollTotal: 0, total: 320, perPerson: 320, missing: [], partial: false });
  });
  it("TL'ye yuvarlar ve geçişleri ayrı toplar", () => {
    const r = estimateTripCost({
      ...base, distanceM: 123_456, fuelPrice: 47.85,
      tollItems: [{ label: "Osmangazi", amount: 1170 }, { label: "O-5", amount: null }, { label: "YSS", amount: 110.4 }],
      people: 3,
    });
    expect(r.energy).toBe(7.9);
    expect(r.fuelCost).toBe(Math.round(123.456 * 0.064 * 47.85)); // 378
    expect(r.tollTotal).toBe(1280);
    expect(r.unknownTolls).toBe(1);
    expect(r.total).toBe(378 + 1280);
    expect(r.perPerson).toBe(Math.round(1658 / 3));
    expect(r.partial).toBe(true);
  });
  it("elektrikte kWh", () => {
    const r = estimateTripCost({ ...base, fuelType: "electric", consumptionPer100: 16, fuelPrice: 8.5 });
    expect(r).toMatchObject({ unit: "kWh", energy: 16, fuelCost: 136 });
  });
  it("eksik fiyat: enerji hesaplanır, maliyet null, nedeni döner", () => {
    const r = estimateTripCost({ ...base, fuelPrice: null, tollItems: [{ label: "x", amount: 59 }] });
    expect(r.energy).toBe(6.4);
    expect(r.fuelCost).toBeNull();
    expect(r.missing).toEqual(["fuelPrice"]);
    expect(r.total).toBe(59);
    expect(r.partial).toBe(true);
  });
  it("hiçbir şey bilinmiyorsa toplam null", () => {
    const r = estimateTripCost({ distanceM: null, consumptionPer100: null, fuelType: "diesel", fuelPrice: null, tollItems: [] });
    expect(r.missing).toEqual(["distance", "consumption", "fuelPrice"]);
    expect(r.energy).toBeNull();
    expect(r.total).toBeNull();
    expect(r.perPerson).toBeNull();
  });
  it("geçersiz değerleri (negatif, NaN, aşırı) eksik sayar", () => {
    expect(estimateTripCost({ ...base, consumptionPer100: -1 }).missing).toEqual(["consumption"]);
    expect(estimateTripCost({ ...base, consumptionPer100: 500 }).missing).toEqual(["consumption"]);
    expect(estimateTripCost({ ...base, fuelPrice: Number.NaN }).missing).toEqual(["fuelPrice"]);
    expect(estimateTripCost({ ...base, distanceM: 0 }).missing).toEqual(["distance"]);
    expect(estimateTripCost({ ...base, tollItems: [{ label: "x", amount: -5 }] }).unknownTolls).toBe(1);
  });
  it("ücretsiz (0 TL) geçiş bilinen sayılır; ekler toplama girer", () => {
    const r = estimateTripCost({ ...base, tollItems: [{ label: "x", amount: 0 }], extras: [{ label: "otopark", amount: 100 }] });
    expect(r.unknownTolls).toBe(0);
    expect(r.extrasTotal).toBe(100);
    expect(r.total).toBe(420);
  });
  it("geçersiz kişi sayısı 1'e düşer", () => {
    expect(estimateTripCost({ ...base, people: 0 }).people).toBe(1);
    expect(estimateTripCost({ ...base, people: 2 }).perPerson).toBe(160);
  });
});

describe("estimateRangeKm", () => {
  it("50 L / 6,4 L/100 km ≈ 781 km", () => expect(estimateRangeKm(50, 6.4)).toBe(781));
  it("eksikse null", () => {
    expect(estimateRangeKm(null, 6.4)).toBeNull();
    expect(estimateRangeKm(50, null)).toBeNull();
    expect(estimateRangeKm(50, 0)).toBeNull();
  });
});

const step = (instruction: string, km: number, o: Partial<RouteStep> = {}): RouteStep => ({
  instruction, kind: "straight", distanceMeters: km * 1000, durationSeconds: 60, location: { lat: 40, lng: 29 }, toll: false, ...o,
});

describe("detectRouteTolls", () => {
  it("ardışık ücretli adımları otoyol kesimi olarak gruplar (ad + km), tutar null", () => {
    const items = detectRouteTolls({
      hasToll: true, hasFerry: false,
      steps: [
        step("Batıya doğru sürün.", 2, { kind: "depart" }),
        step("Kuzey Marmara Otoyolu caddesine girin.", 40, { toll: true, kind: "merge" }),
        step("O-7 üzerinde kalın.", 20.4, { toll: true }),
        step("D-100 caddesine çıkın.", 10),
        step("O-4 caddesine girin.", 30, { toll: true }),
        step("Varış noktanıza ulaştınız.", 0, { kind: "arrive" }),
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "motorway", amount: null, km: 60 });
    expect(items[0].label).toContain("Kuzey Marmara Otoyolu, O-7");
    expect(items[1].label).toContain("O-4");
    expect(items[1].km).toBe(30);
  });
  it("bilinen geçişi referans tutarla ekler ve otoyol grubundan çıkarır (çift sayım yok, grup bölünmez)", () => {
    const items = detectRouteTolls({
      hasToll: true, hasFerry: false,
      steps: [
        step("O-5 caddesine girin.", 30, { toll: true }),
        step("Osmangazi Köprüsü üzerinden devam edin.", 3, { toll: true }),
        step("O-5 üzerinde kalın.", 50, { toll: true }),
      ],
    });
    const crossings = items.filter((i) => i.kind === "crossing");
    expect(crossings).toEqual([expect.objectContaining({ label: "Osmangazi Köprüsü", amount: 1170, source: "reference" })]);
    const mw = items.filter((i) => i.kind === "motorway");
    expect(mw).toHaveLength(1);
    expect(mw[0].km).toBe(80);
  });
  it("istisna köprüleri (tollBridges) geçiş olarak ekler; ücretsiz adımlardaki tabela adlarını saymaz", () => {
    const items = detectRouteTolls({
      hasToll: false, hasFerry: false, tollBridges: ["15 Temmuz Şehitler Köprüsü"],
      steps: [step("Fikirtepe/Avrasya Tüneli işaretine doğru çıkın.", 1)],
    });
    expect(items.map((i) => i.label)).toEqual(["15 Temmuz Şehitler Köprüsü"]);
    expect(items[0].note).toMatch(/Avrupa→Asya/);
  });
  it("yalnızca geçişten oluşan ücretli adım otoyol kalemi üretmez", () => {
    const items = detectRouteTolls({ hasToll: true, hasFerry: false, steps: [step("Avrasya Tüneli.", 5, { toll: true })] });
    expect(items).toEqual([expect.objectContaining({ kind: "crossing", amount: 330 })]);
  });
  it("feribotları ayrı kalem olarak listeler", () => {
    const items = detectRouteTolls({
      hasToll: false, hasFerry: true,
      steps: [step("Eskihisar - Topçular feribotuna binin.", 8.5, { kind: "ferry", toll: true }), step("Feribottan inin.", 17)],
    });
    expect(items).toEqual([expect.objectContaining({ kind: "ferry", amount: null, label: "Feribot ücreti · Eskihisar - Topçular" })]);
  });
  it("adım yoksa bayraklardan genel kalemler", () => {
    const items = detectRouteTolls({ hasToll: true, hasFerry: true });
    expect(items.map((i) => i.kind)).toEqual(["motorway", "ferry"]);
    expect(items.every((i) => i.amount === null)).toBe(true);
  });
  it("ücretsiz rota → boş", () => expect(detectRouteTolls({ hasToll: false, hasFerry: false, steps: [step("x", 3)] })).toEqual([]));
});

describe("yardımcılar", () => {
  it("motorwayNames", () => {
    expect(motorwayNames(["Anadolu Otoyolu/O-4 caddesine girin.", "O-4 üzerinde kalın."])).toEqual(["Anadolu Otoyolu", "O-4"]);
    expect(motorwayNames(["sağa dönün"])).toEqual([]);
  });
  it("ferryName", () => {
    expect(ferryName("Feribottan inin.")).toBeNull();
    expect(ferryName("Geyikli - Bozcaada feribotuna binin.")).toBe("Geyikli - Bozcaada");
  });
  it("tollsForSavedTrip", () => {
    const items = tollsForSavedTrip({ names: ["Yavuz Sultan Selim Köprüsü", "Bursa"], hasToll: true, hasFerry: false });
    expect(items.map((i) => [i.kind, i.amount])).toEqual([["crossing", 110], ["motorway", null]]);
  });
  it("readFuelPrices ve readAssumptions bozuk veriyi yok sayar", () => {
    expect(readFuelPrices({ fuelPrices: { gasoline: { price: 50, date: "2026-11-01" }, bogus: { price: 1, date: "2026-11-01" } } }))
      .toEqual({ gasoline: { price: 50, date: "2026-11-01" } });
    expect(readFuelPrices({ fuelPrices: { gasoline: { price: -1, date: "x" } } })).toEqual({});
    expect(readFuelPrices(null)).toEqual({});
    expect(readAssumptions({ fuelType: "diesel", consumption: 5, fuelPrice: null, tolls: [] })).toMatchObject({ v: 1, people: 1, vehicleId: null });
    expect(readAssumptions({ fuelType: "kerosene", consumption: 5, fuelPrice: null, tolls: [] })).toBeNull();
  });
});
