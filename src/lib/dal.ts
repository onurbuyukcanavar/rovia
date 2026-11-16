import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

/**
 * Veri Erişim Katmanı: oturumu doğrular ve dar bir kullanıcı nesnesi döndürür.
 * İstek başına bir kez çalışır (React cache). Oturum yoksa null.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;

  const userId = data.claims.sub;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, username, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[rovia] Profil okunamadı:", profileError.message);
  }

  return {
    id: userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    fullName: profile?.full_name ?? null,
    username: profile?.username ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
});

/** Oturum zorunlu sayfalar için: oturum yoksa giriş sayfasına yönlendirir. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/giris");
  return user;
}

export function firstName(user: Pick<CurrentUser, "fullName" | "email">): string | null {
  if (user.fullName) return user.fullName.trim().split(/\s+/)[0] ?? null;
  return null;
}
