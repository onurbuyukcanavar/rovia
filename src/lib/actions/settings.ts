"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { getSiteUrl } from "@/lib/site-url";
import { profileSchema, toFieldErrors } from "@/lib/validation/auth";
import type { FormState } from "@/lib/actions/auth";
import { t } from "@/i18n";

export async function updateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = { fullName: String(fd.get("fullName") ?? ""), username: String(fd.get("username") ?? "") };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error), values: raw };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, username: parsed.data.username })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505") return { status: "error", fieldErrors: { username: t.settings.usernameTaken }, values: raw };
    console.error("[rovia] Profil güncellenemedi:", error.code);
    return { status: "error", message: t.common.unexpectedError, values: raw };
  }
  revalidatePath("/", "layout");
  return { status: "success", message: t.settings.profileSaved, values: raw };
}

/** Oturumdaki hesaba Google kimliği bağlar (Supabase'de "Manual linking" açık olmalı). */
export async function linkGoogle(): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback?next=/ayarlar?linked=google` },
  });
  if (error || !data?.url) {
    console.error("[rovia] Google bağlama başlatılamadı:", error?.code ?? error?.message);
    redirect("/ayarlar?error=link");
  }
  redirect(data.url);
}

export async function unlinkGoogle(): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) redirect("/ayarlar?error=unlink");

  const identities = data?.identities ?? [];
  const google = identities.find((i) => i.provider === "google");
  // Tek giriş yöntemini kaldırmak hesabı kilitler; buna izin verilmez
  if (!google || identities.length < 2) redirect("/ayarlar?error=last_identity");

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(google);
  if (unlinkError) {
    console.error("[rovia] Google bağlantısı kaldırılamadı:", unlinkError.code);
    redirect("/ayarlar?error=unlink");
  }
  revalidatePath("/ayarlar");
  redirect("/ayarlar?unlinked=google");
}
