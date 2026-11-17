import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

/** OAuth (PKCE) dönüşü: yetkilendirme kodunu oturuma çevirir. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  const providerError = searchParams.get("error");

  if (providerError) {
    const target = next.startsWith("/ayarlar") ? "/ayarlar?error=link" : "/giris?error=callback";
    return NextResponse.redirect(new URL(target, origin));
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.warn("[rovia:uyarı] OAuth kod değişimi başarısız (geçersiz ya da süresi dolmuş kod):", error.code);
  }

  return NextResponse.redirect(new URL("/giris?error=callback", origin));
}
