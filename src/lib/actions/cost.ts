"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { FUEL_TYPES, LIMITS, type CostAssumptions, type FuelPrices, type FuelType, type Vehicle } from "@/lib/cost/types";
import { costAssumptionsSchema, readFuelPrices } from "@/lib/cost/schema";
import { getFuelPrices, listVehicles } from "@/lib/queries/vehicles";
import { t } from "@/i18n";

type Fail = { ok: false; message: string };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

async function limited() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: "journal" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return { supabase, allowed: data === true };
}

type Sb = Awaited<ReturnType<typeof createClient>>;

/** Son girilen fiyatı yakıt türüne göre user_settings.cost_defaults.fuelPrices içine yazar (değişmişse). */
async function rememberPrice(supabase: Sb, userId: string, fuelType: FuelType, price: number) {
  const { data } = await supabase.from("user_settings").select("cost_defaults").eq("user_id", userId).maybeSingle();
  const current = (data?.cost_defaults && typeof data.cost_defaults === "object" && !Array.isArray(data.cost_defaults)
    ? data.cost_defaults : {}) as Record<string, unknown>;
  const prices = readFuelPrices(current);
  if (prices[fuelType]?.price === price) return;
  const next = { ...current, fuelPrices: { ...prices, [fuelType]: { price, date: today() } } };
  const { error } = await supabase.from("user_settings").update({ cost_defaults: next }).eq("user_id", userId);
  if (error) console.error("[rovia] Yakıt fiyatı hatırlanamadı:", error.code);
}

/** Planlayıcıdaki maliyet kartı için garaj araçları ve hatırlanan fiyatlar (kart açılınca yüklenir). */
export async function loadCostContext(): Promise<{ ok: true; vehicles: Vehicle[]; fuelPrices: FuelPrices } | Fail> {
  const user = await requireUser();
  try {
    const [vehicles, fuelPrices] = await Promise.all([listVehicles(), getFuelPrices(user.id)]);
    return { ok: true, vehicles, fuelPrices };
  } catch (e) {
    console.error("[rovia] Maliyet bilgileri okunamadı:", e instanceof Error ? e.message : e);
    return { ok: false, message: t.garage.cost.loadError };
  }
}

const priceSchema = z.object({ fuelType: z.enum(FUEL_TYPES), price: z.number().finite().gt(0).max(LIMITS.priceMax) });

/** Planlayıcıda girilen yakıt fiyatını hatırla. */
export async function rememberFuelPrice(input: z.input<typeof priceSchema>): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.garage.errors.invalid };
  const { supabase, allowed } = await limited();
  if (!allowed) return { ok: false, message: t.garage.errors.rateLimited };
  await rememberPrice(supabase, user.id, parsed.data.fuelType, parsed.data.price);
  return { ok: true };
}

/** Yolculuğun maliyet varsayımlarını (ve aracını) saklar; fiyat ayrıca hatırlanır. */
export async function saveTripCost(tripId: string, assumptions: z.input<typeof costAssumptionsSchema>): Promise<{ ok: true } | Fail> {
  const user = await requireUser();
  if (!z.uuid().safeParse(tripId).success) return { ok: false, message: t.garage.errors.invalid };
  const parsed = costAssumptionsSchema.safeParse(assumptions);
  if (!parsed.success) return { ok: false, message: t.garage.errors.invalid };
  const a: CostAssumptions = parsed.data;
  const { supabase, allowed } = await limited();
  if (!allowed) return { ok: false, message: t.garage.errors.rateLimited };

  const { data, error } = await supabase.from("trips")
    .update({ cost_assumptions: a, vehicle_id: a.vehicleId })
    .eq("id", tripId).select("id");
  if (error) {
    // Araç bu arada silinmiş olabilir (yabancı anahtar): aracı boşaltıp yeniden dene
    if (error.code === "23503") {
      const retry = await supabase.from("trips").update({ cost_assumptions: { ...a, vehicleId: null }, vehicle_id: null }).eq("id", tripId);
      if (!retry.error) return { ok: true };
    }
    console.error("[rovia] Maliyet varsayımları kaydedilemedi:", error.code);
    return { ok: false, message: t.garage.cost.saveError };
  }
  if (!data?.length) return { ok: false, message: t.garage.errors.invalid };
  if (a.fuelPrice !== null) await rememberPrice(supabase, user.id, a.fuelType, a.fuelPrice);
  return { ok: true };
}
