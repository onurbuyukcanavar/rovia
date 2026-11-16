import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { io } from "next/cache";
import type { Database } from "@/lib/database.types";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Sunucu bileşenleri, Server Actions ve Route Handler'lar için Supabase istemcisi.
 * Kullanıcının oturum çerezini taşır; tüm sorgular RLS altında çalışır.
 */
export async function createClient() {
  // Önce çerezler okunur: bu, bileşeni isteğe bağlı (dinamik) yapar.
  const cookieStore = await cookies();
  // Supabase Auth, token süresini Date.now() ile denetler ve ağ isteği yapar. Partial Prefetching'in
  // oturuma özel ön-render'ında bu noktada askıya alınır; gerçek istekte hemen devam eder.
  await io();
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
