import { getCurrentUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { isThemePreference } from "@/lib/theme/theme";
import { AccountThemeSync } from "./account-theme-sync";

/** Hesaptaki tema tercihini okur (dinamik; kabukta Suspense içinde). */
export async function AccountTheme() {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("theme").eq("user_id", user.id).maybeSingle();
  const pref = isThemePreference(data?.theme) ? data.theme : null;
  return <AccountThemeSync accountPref={pref} />;
}
