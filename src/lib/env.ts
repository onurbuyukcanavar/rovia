/**
 * Not: zod burada bilinçli olarak kullanılmıyor — bu modül istemci paketine de girer (≈30 KB gzip tasarruf).
 */
type PublicEnv = { supabaseUrl?: string; supabaseKey?: string; siteUrl?: string; mapStyleUrl?: string };

const isUrl = (v: string) => {
  try {
    return Boolean(new URL(v).protocol);
  } catch {
    return false;
  }
};

const raw: PublicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL || undefined,
};

const issues = [
  ...(["supabaseUrl", "siteUrl", "mapStyleUrl"] as const).filter((k) => raw[k] !== undefined && !isUrl(raw[k]!)).map((k) => `${k}: geçersiz URL`),
  ...(raw.supabaseKey !== undefined && raw.supabaseKey.length < 20 ? ["supabaseKey: en az 20 karakter olmalı"] : []),
];

if (issues.length) {
  // Hatalı (eksik değil, biçimsiz) değerler geliştiriciye net bildirilmeli
  console.error("[rovia] Geçersiz ortam değişkeni:", issues.join("; "));
}

export const publicEnv: PublicEnv = issues.length ? {} : raw;

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

/**
 * Harita stili (MapLibre). Varsayılan: OpenFreeMap "liberty" — anahtarsız, limitsiz, OSM verisi.
 * Kendi karo sunucumuza geçişte yalnızca NEXT_PUBLIC_MAP_STYLE_URL değişir.
 */
export const mapStyleUrl = () => publicEnv.mapStyleUrl ?? "https://tiles.openfreemap.org/styles/liberty";
