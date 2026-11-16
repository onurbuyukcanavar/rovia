import { z } from "zod";

/**
 * Ortam değişkenleri. Eksik değerler uygulamayı çökertmez; ilgili özellik
 * "kurulum gerekiyor" durumuna düşer ve kullanıcıya açıkça gösterilir.
 * NEXT_PUBLIC_ değişkenleri derleme zamanında gömülür; bu yüzden tek tek okunur.
 */
const publicSchema = z.object({
  supabaseUrl: z.url().optional(),
  supabaseKey: z.string().min(20).optional(),
  siteUrl: z.url().optional(),
  mapsBrowserKey: z.string().min(10).optional(),
  mapsMapId: z.string().min(4).optional(),
});

const parsed = publicSchema.safeParse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  mapsBrowserKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || undefined,
  mapsMapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined,
});

if (!parsed.success) {
  // Hatalı (eksik değil, biçimsiz) değerler geliştiriciye net bildirilmeli
  console.error("[rovia] Geçersiz ortam değişkeni:", z.prettifyError(parsed.error));
}

export const publicEnv = parsed.success ? parsed.data : {};

export function getSupabaseConfig() {
  const { supabaseUrl, supabaseKey } = publicEnv;
  if (!supabaseUrl || !supabaseKey) return null;
  return { url: supabaseUrl, key: supabaseKey };
}

export const isSupabaseConfigured = getSupabaseConfig() !== null;

export const REQUIRED_ENV_VARS = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", example: "https://xxxx.supabase.co" },
  { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", example: "sb_publishable_…" },
  { name: "NEXT_PUBLIC_SITE_URL", example: "http://localhost:3000" },
] as const;

/** Haritanın tarayıcıda yüklenebilmesi için gereken ayarlar (Map ID, Advanced Markers için zorunlu). */
export function getMapsBrowserConfig() {
  const { mapsBrowserKey, mapsMapId } = publicEnv;
  if (!mapsBrowserKey || !mapsMapId) return null;
  return { apiKey: mapsBrowserKey, mapId: mapsMapId };
}
