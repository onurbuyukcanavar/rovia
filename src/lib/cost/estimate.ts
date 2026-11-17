import { energyUnit, LIMITS, type FuelType } from "./types";

export type EstimateLine = { label: string; amount: number | null };

export type EstimateInput = {
  distanceM: number | null;
  consumptionPer100: number | null;
  fuelType: FuelType;
  fuelPrice: number | null;
  tollItems: EstimateLine[];
  extras?: EstimateLine[];
  people?: number | null;
};

export type MissingReason = "distance" | "consumption" | "fuelPrice";

export type EstimateResult = {
  /** Litre (elektrikte kWh), 0,1 hassasiyetinde */
  energy: number | null;
  unit: "L" | "kWh";
  /** Yakıt/enerji maliyeti (TL, tam sayıya yuvarlanmış) */
  fuelCost: number | null;
  tollTotal: number;
  /** Tutarı girilmemiş geçiş sayısı */
  unknownTolls: number;
  extrasTotal: number;
  /** Bilinen kalemlerin toplamı; hiçbir kalem bilinmiyorsa null */
  total: number | null;
  perPerson: number | null;
  people: number;
  missing: MissingReason[];
  /** Eksik girdi veya tutarı bilinmeyen geçiş varsa true (toplam alt sınırdır) */
  partial: boolean;
};

const valid = (n: number | null | undefined, max: number, allowZero = false): n is number =>
  typeof n === "number" && Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) && n <= max;

function sumLines(lines: EstimateLine[] | undefined) {
  let total = 0;
  let unknown = 0;
  for (const l of lines ?? []) {
    if (valid(l.amount, LIMITS.tollMax, true)) total += l.amount;
    else unknown++;
  }
  return { total: Math.round(total), unknown };
}

/** Saf maliyet hesabı: girdiler varsayımdır; sonuç TL'ye yuvarlanır ve eksikler gerekçeleriyle döner. */
export function estimateTripCost(input: EstimateInput): EstimateResult {
  const missing: MissingReason[] = [];
  const distanceOk = valid(input.distanceM, 50_000_000);
  const consumptionOk = valid(input.consumptionPer100, LIMITS.consumptionMax);
  const priceOk = valid(input.fuelPrice, LIMITS.priceMax);
  if (!distanceOk) missing.push("distance");
  if (!consumptionOk) missing.push("consumption");
  if (!priceOk) missing.push("fuelPrice");

  const rawEnergy = distanceOk && consumptionOk ? (input.distanceM! / 1000) * (input.consumptionPer100! / 100) : null;
  const energy = rawEnergy === null ? null : Math.round(rawEnergy * 10) / 10;
  const fuelCost = rawEnergy !== null && priceOk ? Math.round(rawEnergy * input.fuelPrice!) : null;

  const tolls = sumLines(input.tollItems);
  const extras = sumLines(input.extras);
  const knownAny = fuelCost !== null || tolls.total > 0 || extras.total > 0;
  const total = knownAny ? (fuelCost ?? 0) + tolls.total + extras.total : null;

  const people = valid(input.people ?? null, LIMITS.peopleMax) ? Math.floor(input.people!) : 1;
  const perPerson = total !== null && people >= 1 ? Math.round(total / people) : null;

  return {
    energy,
    unit: energyUnit(input.fuelType),
    fuelCost,
    tollTotal: tolls.total,
    unknownTolls: tolls.unknown + extras.unknown,
    extrasTotal: extras.total,
    total,
    perPerson,
    people,
    missing,
    partial: missing.length > 0 || tolls.unknown + extras.unknown > 0,
  };
}

/** Yaklaşık menzil (km): depo / tüketim × 100; ikisi de bilinmiyorsa null. */
export function estimateRangeKm(tank: number | null, consumptionPer100: number | null): number | null {
  if (!valid(tank, LIMITS.tankMax) || !valid(consumptionPer100, LIMITS.consumptionMax)) return null;
  return Math.round((tank / consumptionPer100) * 100);
}
