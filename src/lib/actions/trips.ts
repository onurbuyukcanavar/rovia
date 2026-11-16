"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { decodePolyline, encodePolyline, simplifyToMaxPoints } from "@/lib/geo";
import { tripPlanSchema, type TripPlanInput } from "@/lib/validation/trip";
import { t } from "@/i18n";

export type SaveTripResult =
  | { ok: true; id: string; version: number; savedAt: string }
  | { ok: false; code: "validation" | "conflict" | "not_found" | "not_editable" | "unexpected"; message: string; fieldErrors?: Record<string, string> };

/** Kaydedilen rota çizgisi: ekranda yol kenarından sapmayacak kadar ayrıntılı, veritabanı için makul boyutta. */
const MAX_STORED_POINTS = 8_000;

/**
 * Yolculuk planını (yolculuk + duraklar + seçili rota) atomik olarak kaydeder.
 * Yeni yolculukta id/version null; mevcut yolculukta son okunan sürüm gönderilir (iyimser kilit).
 */
export async function saveTripPlan(input: TripPlanInput): Promise<SaveTripResult> {
  await requireUser();

  const parsed = tripPlanSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (["title", "description", "plannedDate"].includes(key) && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "validation", message: Object.values(fieldErrors)[0] ?? t.trips.errors.invalid, fieldErrors };
  }
  const plan = parsed.data;

  let route: Record<string, unknown> | null = null;
  if (plan.route) {
    const path = decodePolyline(plan.route.encodedPolyline);
    route = {
      polyline: encodePolyline(simplifyToMaxPoints(path, MAX_STORED_POINTS, 3)),
      distance_m: plan.route.distanceMeters,
      duration_s: plan.route.durationSeconds,
      legs: plan.route.legs.map((l) => ({ d: l.distanceMeters, s: l.durationSeconds })),
      has_toll: plan.route.hasToll,
      has_ferry: plan.route.hasFerry,
    };
  }

  const supabase = await createClient();
  // Üretilen tipler fonksiyon argümanlarını null olamaz kabul eder; SQL tarafı null'ı bilinçli olarak işler.
  const args = {
    p_trip_id: plan.id,
    p_expected_version: plan.version,
    p_title: plan.title,
    p_description: plan.description,
    p_planned_date: plan.plannedDate,
    p_stops: plan.stops,
    p_route: route,
  };
  const { data, error } = await supabase.rpc("save_trip_plan", args as never).single<{ trip_id: string; trip_version: number }>();

  if (error || !data?.trip_id || !data.trip_version) {
    const msg = error?.message ?? "";
    if (msg.includes("trip_conflict")) return { ok: false, code: "conflict", message: t.trips.errors.conflict };
    if (msg.includes("trip_not_found")) return { ok: false, code: "not_found", message: t.trips.errors.notFound };
    if (msg.includes("trip_not_editable")) return { ok: false, code: "not_editable", message: t.trips.errors.notEditable };
    if (error?.code === "23514" || error?.code === "22023" || error?.code === "22P02") {
      return { ok: false, code: "validation", message: t.trips.errors.invalid };
    }
    console.error("[rovia] Yolculuk kaydedilemedi:", error?.code, msg);
    return { ok: false, code: "unexpected", message: t.common.unexpectedError };
  }

  // Açık planlayıcının yolu bilerek yenilenmez: ekrandaki durum zaten kaydedilen durumdur
  // (yenilemek bileşeni sıfırlar ve rotayı gereksiz yere yeniden hesaplatır).
  revalidatePath("/yolculuklar");
  revalidatePath("/panel");
  return { ok: true, id: data.trip_id, version: data.trip_version, savedAt: new Date().toISOString() };
}

export async function deleteTrip(id: string): Promise<{ ok: boolean; message?: string }> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: t.trips.errors.notFound };

  const supabase = await createClient();
  // RLS yalnızca kendi yolculuğunu silmeye izin verir; duraklar ON DELETE CASCADE ile silinir
  const { data, error } = await supabase.from("trips").delete().eq("id", id).select("id");
  if (error) {
    console.error("[rovia] Yolculuk silinemedi:", error.code);
    return { ok: false, message: t.trips.deleteFailed };
  }
  if (!data?.length) return { ok: false, message: t.trips.errors.notFound };

  revalidatePath("/yolculuklar");
  revalidatePath("/panel");
  return { ok: true };
}
