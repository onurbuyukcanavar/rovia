import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import type { Database } from "@/lib/database.types";
import { getSupabaseConfig } from "@/lib/env";
import type { SharePayload } from "./types";
import { mediaPaths, normalizeOptions } from "./view";

export const SIGNED_URL_TTL = 3600;
export const TOKEN_RE = /^[0-9a-f]{64}$/;
export const shareTag = (token: string) => `share:${token}`;

/**
 * Oturumsuz (çerezsiz) istemci: paylaşım sayfası yalnızca share_get() ve paylaşım kapsamındaki dosyalar için
 * imzalı bağlantı (storage politikası media_shared) ile çalışır. Servis rolü anahtarı KULLANILMAZ.
 */
function anonClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient<Database>(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type LoadedShare = { payload: SharePayload; signed: Record<string, string> };

/**
 * Paylaşım verisi + imzalı fotoğraf bağlantıları. Kısa süre önbelleğe alınır (iptal edilen paylaşımlar en geç
 * birkaç dakikada düşer; ayar değişince share eylemleri etiketi hemen geçersiz kılar).
 */
export async function loadShare(token: string): Promise<LoadedShare | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 120, expire: 300 });
  cacheTag(shareTag(token));
  if (!TOKEN_RE.test(token)) return null;
  const supabase = anonClient();
  const { data, error } = await supabase.rpc("share_get", { p_token: token });
  if (error) throw new Error(`SHARE_GET_FAILED: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  const raw = data as unknown as SharePayload;
  const payload: SharePayload = { ...raw, options: normalizeOptions(raw.options), privacyRadiusM: Number(raw.privacyRadiusM ?? 0) };

  const signed: Record<string, string> = {};
  const paths = mediaPaths(payload);
  for (let i = 0; i < paths.length; i += 500) {
    const { data: urls, error: signError } = await supabase.storage.from("media").createSignedUrls(paths.slice(i, i + 500), SIGNED_URL_TTL);
    if (signError) {
      console.error("[rovia] paylaşım fotoğrafları imzalanamadı:", signError.message);
      break;
    }
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
  }
  return { payload, signed };
}
