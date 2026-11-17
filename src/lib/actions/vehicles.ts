"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { FUEL_TYPES, LIMITS } from "@/lib/cost/types";
import { t } from "@/i18n";

type Result = { ok: true; id?: string } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const E = t.garage.errors;

async function limited() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: "journal" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return { supabase, allowed: data === true };
}

const optText = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable();

const vehicleSchema = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().max(80),
  make: optText(60),
  model: optText(60),
  modelYear: z.number().int().min(1900).max(2100).nullable(),
  fuelType: z.enum(FUEL_TYPES),
  consumption: z.number().finite().gt(0).max(LIMITS.consumptionMax).nullable(),
  tankCapacity: z.number().finite().gt(0).max(LIMITS.tankMax).nullable(),
  makeDefault: z.boolean(),
});
export type VehicleInput = z.input<typeof vehicleSchema>;

const FIELD: Record<string, string> = { modelYear: E.year, consumption: E.number, tankCapacity: E.number };

/** Araç ekler veya günceller. Ad boşsa "Marka Model" kullanılır. */
export async function saveVehicle(input: VehicleInput): Promise<Result> {
  const user = await requireUser();
  const parsed = vehicleSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "");
      if (k && !fieldErrors[k]) fieldErrors[k] = FIELD[k] ?? E.invalid;
    }
    return { ok: false, message: Object.values(fieldErrors)[0] ?? E.invalid, fieldErrors };
  }
  const v = parsed.data;
  const name = (v.name || [v.make, v.model].filter(Boolean).join(" ")).slice(0, 80).trim();
  if (!name) return { ok: false, message: E.nameRequired, fieldErrors: { name: E.nameRequired } };

  const { supabase, allowed } = await limited();
  if (!allowed) return { ok: false, message: E.rateLimited };

  const row = {
    name, make: v.make, model: v.model, model_year: v.modelYear, fuel_type: v.fuelType,
    consumption_per_100km: v.consumption === null ? null : Math.round(v.consumption * 100) / 100,
    tank_capacity: v.tankCapacity === null ? null : Math.round(v.tankCapacity * 10) / 10,
  };
  let id = v.id;
  if (id) {
    const { data, error } = await supabase.from("vehicles").update(row).eq("id", id).select("id");
    if (error) {
      console.error("[rovia] Araç güncellenemedi:", error.code);
      return { ok: false, message: t.common.unexpectedError };
    }
    if (!data?.length) return { ok: false, message: E.notFound };
  } else {
    const { data, error } = await supabase.from("vehicles").insert({ ...row, user_id: user.id }).select("id").single();
    if (error || !data) {
      if (error?.message?.includes("too_many_vehicles")) return { ok: false, message: E.tooMany };
      console.error("[rovia] Araç eklenemedi:", error?.code);
      return { ok: false, message: t.common.unexpectedError };
    }
    id = data.id;
  }
  if (v.makeDefault) {
    const { error } = await supabase.rpc("vehicle_set_default", { p_id: id });
    if (error) console.error("[rovia] Varsayılan araç ayarlanamadı:", error.code);
  }
  revalidatePath("/garaj");
  return { ok: true, id };
}

export async function deleteVehicle(id: string): Promise<Result> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: E.invalid };
  const { supabase, allowed } = await limited();
  if (!allowed) return { ok: false, message: E.rateLimited };
  const { data, error } = await supabase.from("vehicles").delete().eq("id", id).select("id");
  if (error) {
    console.error("[rovia] Araç silinemedi:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  if (!data?.length) return { ok: false, message: E.notFound };
  revalidatePath("/garaj");
  return { ok: true };
}

/** Varsayılan aracı değiştirir; null → varsayılan yok. */
export async function setDefaultVehicle(id: string | null): Promise<Result> {
  await requireUser();
  if (id !== null && !z.uuid().safeParse(id).success) return { ok: false, message: E.invalid };
  const { supabase, allowed } = await limited();
  if (!allowed) return { ok: false, message: E.rateLimited };
  // Üretilen tip p_id'yi null olamaz sayar; SQL tarafı null'ı "varsayılan yok" olarak işler.
  const { error } = await supabase.rpc("vehicle_set_default", { p_id: id } as never);
  if (error) {
    if (error.code === "PT404") return { ok: false, message: E.notFound };
    console.error("[rovia] Varsayılan araç ayarlanamadı:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  revalidatePath("/garaj");
  return { ok: true };
}
