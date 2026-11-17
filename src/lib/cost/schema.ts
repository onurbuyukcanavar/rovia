import { z } from "zod";
import { FUEL_TYPES, LIMITS, isFuelType, type FuelPrices } from "./types";

const money = z.number().finite().min(0).max(LIMITS.tollMax);

/** trips.cost_assumptions (≤ 8 KB) */
export const costAssumptionsSchema = z.object({
  v: z.literal(1).default(1),
  vehicleId: z.uuid().nullable().default(null),
  fuelType: z.enum(FUEL_TYPES),
  consumption: z.number().finite().gt(0).max(LIMITS.consumptionMax).nullable(),
  fuelPrice: z.number().finite().gt(0).max(LIMITS.priceMax).nullable(),
  priceDate: z.iso.date().nullable().default(null),
  people: z.number().int().min(1).max(LIMITS.peopleMax).default(1),
  tolls: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    amount: money.nullable(),
    source: z.enum(["reference", "user"]),
    kind: z.enum(["crossing", "motorway", "ferry", "custom"]),
    note: z.string().max(200).optional(),
    km: z.number().finite().min(0).max(10_000).optional(),
  })).max(30),
});
export type CostAssumptions = z.infer<typeof costAssumptionsSchema>;

const pricesSchema = z.record(z.string(), z.object({ price: z.number().finite().gt(0).max(LIMITS.priceMax), date: z.iso.date() }));

/** user_settings.cost_defaults → yalnızca geçerli yakıt fiyatları (bozuk kayıtlar yok sayılır). */
export function readFuelPrices(raw: unknown): FuelPrices {
  const fp = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).fuelPrices : null) ?? null;
  const parsed = pricesSchema.safeParse(fp);
  if (!parsed.success) return {};
  const out: FuelPrices = {};
  for (const [k, v] of Object.entries(parsed.data)) if (isFuelType(k)) out[k] = v;
  return out;
}

/** trips.cost_assumptions'ı okur; geçersizse null. */
export function readAssumptions(raw: unknown): CostAssumptions | null {
  const parsed = costAssumptionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
