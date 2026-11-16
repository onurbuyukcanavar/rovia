import "server-only";
import { getSupabaseConfig } from "@/lib/env";

/**
 * Supabase'de Google girişinin açık olup olmadığı (Auth → Providers → Google).
 * Kapalıyken Supabase /authorize ham bir JSON hatası döndürür; kullanıcıyı oraya göndermek yerine
 * anlaşılır bir mesaj gösterebilmek için tıklama anında sorulur. Bilinemiyorsa (ağ hatası) null:
 * akış engellenmez.
 */
export async function isGoogleAuthEnabled(): Promise<boolean | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/auth/v1/settings`, {
      headers: { apikey: config.key },
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { external?: Record<string, boolean> };
    return typeof body.external?.google === "boolean" ? body.external.google : null;
  } catch {
    return null;
  }
}
