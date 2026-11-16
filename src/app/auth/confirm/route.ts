import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * E-posta bağlantıları (kayıt doğrulama, şifre sıfırlama) için sunucu tarafı doğrulama.
 * Supabase e-posta şablonlarında bağlantı şu biçimde olmalı:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=<tür>&next=<yol>
 * (docs/SETUP.md §3)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(type === "recovery" ? "/sifre-yenile" : next, origin));
    }
    console.error("[rovia] E-posta doğrulaması başarısız:", error.code);
  } else if (code) {
    // Varsayılan Supabase şablonlarıyla (PKCE) gelen bağlantılar
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("[rovia] E-posta kod değişimi başarısız:", error.code);
  }

  return NextResponse.redirect(new URL("/giris?error=callback", origin));
}
