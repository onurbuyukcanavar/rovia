import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Sunucu bileşenleri, Server Actions ve Route Handler'lar için Supabase istemcisi.
 * Kullanıcının oturum çerezini taşır; tüm sorgular RLS altında çalışır.
 */
export async function createClient() {
  // Önce çerezler okunur: bu, bileşeni isteğe bağlı (dinamik) yapar ve ön-render'da çalışmasını engeller.
  const cookieStore = await cookies();
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component içinden çağrıldığında çerez yazılamaz; oturum yenilemeyi proxy.ts üstlenir.
        }
      },
    },
  });
}
