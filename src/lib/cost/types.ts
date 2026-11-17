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

export type FuelPrices = Partial<Record<FuelType, { price: number; date: string }>>;

/** Doğrulama şemaları ve okuyucular: ./schema.ts (zod istemci paketine girmesin diye ayrı). */
export type { CostAssumptions } from "./schema";
