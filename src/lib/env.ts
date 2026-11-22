import { DEFAULT_MAP_STYLE_LIGHT } from "@/lib/maps/style";
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
 * Koyu temada istemci tarafında koyu karşılığa geçilir: src/lib/maps/style.ts, <ThemedMapStyle>.
 */
export const mapStyleUrl = () => publicEnv.mapStyleUrl ?? DEFAULT_MAP_STYLE_LIGHT;

/** Google OAuth "Web application" istemci kimliği biçimi (gizli değildir; tarayıcıya gömülür). */
export const GOOGLE_CLIENT_ID_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

/**
 * İsteğe bağlı: NEXT_PUBLIC_GOOGLE_CLIENT_ID. Tanımlıysa Google girişi Google Identity Services (web) ve
 * Android Credential Manager ile kimlik belirteci (ID token) üzerinden yapılır; Google'ın hesap seçicisi
 * "roviaroad.com" gösterir. Tanımsız ya da biçimsizse eski Supabase OAuth yönlendirmesi kullanılır.
 * Biçimsiz değer Supabase yapılandırmasını geçersiz kılmaz; yalnızca yok sayılır.
 */
const rawGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || undefined;
if (rawGoogleClientId && !GOOGLE_CLIENT_ID_RE.test(rawGoogleClientId)) {
  console.error("[rovia] Geçersiz ortam değişkeni: NEXT_PUBLIC_GOOGLE_CLIENT_ID (…apps.googleusercontent.com bekleniyor); yok sayıldı.");
}
export const googleClientId: string | null =
  rawGoogleClientId && GOOGLE_CLIENT_ID_RE.test(rawGoogleClientId) ? rawGoogleClientId : null;
