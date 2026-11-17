import { z } from "zod";

export const FUEL_TYPES = ["gasoline", "diesel", "lpg", "hybrid", "plugin_hybrid", "electric", "other"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const isFuelType = (v: unknown): v is FuelType => typeof v === "string" && (FUEL_TYPES as readonly string[]).includes(v);

/** Elektrikli araçlarda tüketim kWh/100 km, fiyat TL/kWh; diğerlerinde L/100 km ve TL/L. */
export const energyUnit = (f: FuelType): "L" | "kWh" => (f === "electric" ? "kWh" : "L");

export const LIMITS = {
  consumptionMax: 100,
  tankMax: 99_999,
  priceMax: 10_000,
  tollMax: 100_000,
  peopleMax: 9,
} as const;

export type TollKind = "crossing" | "motorway" | "ferry" | "custom";
export type TollSource = "reference" | "user";

/** Maliyet hesabındaki tek bir geçiş/ek kalem. amount null → tutar kullanıcıdan bekleniyor. */
export type TollItem = {
  id: string;
  label: string;
  amount: number | null;
  source: TollSource;
  kind: TollKind;
  note?: string;
  km?: number;
};

export type Vehicle = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  modelYear: number | null;
  fuelType: FuelType;
  consumption: number | null;
  tankCapacity: number | null;
  isDefault: boolean;
};

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

export type FuelPrices = Partial<Record<FuelType, { price: number; date: string }>>;

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
