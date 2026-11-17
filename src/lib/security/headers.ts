/**
 * Güvenlik başlıkları ve Content-Security-Policy (next.config.ts tarafından derleme anında kullanılır).
 * Saf modül: next/* ya da "@/..." içe aktarmaz; birim testlenebilir.
 *
 * Neden nonce yok: Next.js 16'da nonce'lu CSP her sayfanın dinamik işlenmesini gerektirir ve
 * Partial Prerendering (cacheComponents) ile uyumsuzdur (node_modules/next/dist/docs/01-app/02-guides/
 * content-security-policy.md, "Static vs Dynamic Rendering with CSP"). Next.js RSC verisini satır içi
 * <script> ile aktardığı için nonce olmadan script-src 'unsafe-inline' gerekir. Bunu dengeleyen ölçüler:
 * dış betik kaynağı yok (yalnızca 'self'), object-src 'none', base-uri 'self', frame-ancestors 'none',
 * dangerouslySetInnerHTML kullanılmıyor ve kullanıcı içeriği React ile kaçışlanarak çiziliyor.
 */

export type CspInput = {
  /** NEXT_PUBLIC_SUPABASE_URL (ör. https://abcd.supabase.co) */
  supabaseUrl?: string | null;
  /** NEXT_PUBLIC_MAP_STYLE_URL; boşsa OpenFreeMap */
  mapStyleUrl?: string | null;
  isDev?: boolean;
};

/** Harita stili, karolar, sprite ve yazı tipleri (glyph) bu kaynaktan gelir. */
export const DEFAULT_MAP_HOST = "https://tiles.openfreemap.org";
/** Google ile girişte profil fotoğrafı (profiles.avatar_url) */
const GOOGLE_AVATAR_HOST = "https://*.googleusercontent.com";
/** Google OAuth: JS'siz form gönderiminde yönlendirme zinciri form-action ile denetlenir */
const GOOGLE_ACCOUNTS = "https://accounts.google.com";

function originOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ supabaseUrl, mapStyleUrl, isDev = false }: CspInput): string {
  const supabase = originOf(supabaseUrl);
  // Supabase URL derlemede bilinmiyorsa (yerel/CI) yalnızca Supabase barındırma alan adına izin verilir
  const supabaseHttp = supabase ?? "https://*.supabase.co";
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : "wss://*.supabase.co";
  const mapHosts = [...new Set([DEFAULT_MAP_HOST, originOf(mapStyleUrl)].filter((h): h is string => !!h))];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline': Next.js satır içi RSC betikleri (yukarıdaki açıklama).
    // 'wasm-unsafe-eval': PDF dizgisi (@react-pdf → yoga-layout WebAssembly). Genel eval'e izin VERMEZ.
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // MapLibre ve React satır içi style öznitelikleri kullanır
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabaseHttp, ...mapHosts, GOOGLE_AVATAR_HOST],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabaseHttp, supabaseWs, ...mapHosts, ...(isDev ? ["ws:"] : [])],
    // MapLibre çalışanı /maplibre/ altından; bazı sürümler blob: çalışan da kurar
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-src": ["'none'"],
    "media-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", supabaseHttp, GOOGLE_ACCOUNTS],
    "frame-ancestors": ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!isDev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export type Header = { key: string; value: string };

export function securityHeaders(input: CspInput): Header[] {
  return [
    { key: "Content-Security-Policy", value: buildCsp(input) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    // Konum yalnızca kendi kaynağımızda (GPS kaydı); kamera/mikrofon vb. kapalı
    {
      key: "Permissions-Policy",
      value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), serial=(), hid=(), browsing-topics=()",
    },
    // Google OAuth açılır pencere akışı için allow-popups
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ];
}

/**
 * Başka sitelerin göstermesi gereken herkese açık görseller (paylaşım önizlemesi, simgeler):
 * Cross-Origin-Resource-Policy gevşetilir. next.config headers() sırası: sonraki kural aynı anahtarı ezer.
 */
export const PUBLIC_EMBEDDABLE_SOURCES = [
  "/p/:token/opengraph-image",
  "/p/:token/twitter-image",
  "/icons/:path*",
  "/icon.svg",
  "/apple-icon",
  "/favicon.ico",
];
