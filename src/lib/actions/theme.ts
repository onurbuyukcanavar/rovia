"use server";

import { getCurrentUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { isThemePreference } from "@/lib/theme/theme";

/**
 * Tema tercihini hesaba yazar (user_settings.theme). Oturum yoksa sessizce hiçbir şey yapmaz:
 * tema her durumda cihazda (çerezde) zaten uygulanmıştır, hesap kaydı yalnızca diğer cihazlar içindir.
 */
export async function saveThemePreference(pref: unknown): Promise<{ ok: boolean }> {
  if (!isThemePreference(pref)) return { ok: false };
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("user_settings").update({ theme: pref }).eq("user_id", user.id);
  if (error) {
    console.warn("[tema] hesaba kaydedilemedi:", error.code);
    return { ok: false };
  }
  return { ok: true };
}
