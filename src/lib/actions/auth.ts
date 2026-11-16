"use server";

import { redirect } from "next/navigation";
import { isGoogleAuthEnabled } from "@/lib/auth-providers";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage } from "@/lib/auth-errors";
import { getSiteUrl } from "@/lib/site-url";
import { safeNextPath } from "@/lib/routes";
import {
  loginSchema, newPasswordSchema, resetRequestSchema, signupSchema, toFieldErrors, type FieldErrors,
} from "@/lib/validation/auth";
import { t } from "@/i18n";

export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
};

const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export async function signInWithPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const parsed = loginSchema.safeParse({ email: str(fd, "email"), password: str(fd, "password") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { status: "error", message: authErrorMessage(error), values };

  redirect(safeNextPath(str(fd, "next")));
}

export async function signUpWithPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email"), fullName: str(fd, "fullName") };
  const parsed = signupSchema.safeParse({
    fullName: str(fd, "fullName"), email: str(fd, "email"), password: str(fd, "password"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm?next=/panel`,
      data: parsed.data.fullName ? { full_name: parsed.data.fullName } : undefined,
    },
  });
  if (error) return { status: "error", message: authErrorMessage(error), values };

  // E-posta doğrulaması kapalıysa oturum hemen açılır
  if (data.session) redirect("/panel");
  return { status: "success", message: t.auth.signupCheckEmail };
}

export async function signInWithGoogle(fd: FormData): Promise<void> {
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const next = safeNextPath(str(fd, "next"));
  if ((await isGoogleAuthEnabled()) === false) {
    redirect(`/giris?error=google_disabled${next !== "/panel" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      // Yalnızca kimlik scope'ları: openid email profile (Supabase varsayılanı). Ek Google API izni istenmez.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    console.error("[rovia] Google OAuth başlatılamadı:", error?.message);
    redirect("/giris?error=oauth");
  }
  redirect(data.url);
}

export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: str(fd, "email") };
  const parsed = resetRequestSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error), values };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/sifre-yenile`,
  });
  // Hesap varlığını sızdırmamak için hız sınırı dışındaki hatalarda da aynı başarı mesajı gösterilir
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { status: "error", message: authErrorMessage(error), values };
  }
  if (error) console.error("[rovia] Şifre sıfırlama e-postası:", error.code);
  return { status: "success", message: t.auth.resetSent };
}

export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({ password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { status: "error", fieldErrors: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: authErrorMessage(error) };
  return { status: "success", message: t.settings.passwordUpdated };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error("[rovia] Oturum kapatılamadı:", error.message);
  redirect("/giris");
}
