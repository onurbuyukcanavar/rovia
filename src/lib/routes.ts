/** Oturum gerektiren uygulama bölümleri. */
const PROTECTED_PREFIXES = [
  "/panel", "/ayarlar", "/diger", "/harita", "/kesfet", "/yolculuklar", "/planla",
  "/kayit-modu", "/favoriler", "/gunluk", "/seyahatnameler", "/garaj",
];

/** Oturum açıkken gösterilmesi anlamsız sayfalar (oturum varsa panele yönlendirilir). */
const AUTH_PAGES = ["/giris", "/kayit", "/sifremi-unuttum"];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export const isProtectedPath = (pathname: string) => PROTECTED_PREFIXES.some((p) => matches(pathname, p));
export const isAuthPagePath = (pathname: string) => AUTH_PAGES.some((p) => matches(pathname, p));

/**
 * Açık yönlendirme (open redirect) saldırılarına karşı yalnızca site içi göreli yolları kabul eder.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/panel"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://rovia.local");
    if (url.origin !== "http://rovia.local") return fallback;
    const out = url.pathname + url.search + url.hash;
    // Nokta bölümleri normalleştirilince ("/./\\x", "/..//x", "/%2e//x") yol "//x" olabilir: tarayıcı bunu
    // protokole göreli dış adres (https://x) olarak yorumlar. Sonuç yeniden doğrulanır.
    if (out.startsWith("//") || out.startsWith("/\\")) return fallback;
    if (new URL(out, "http://rovia.local").origin !== "http://rovia.local") return fallback;
    return out;
  } catch {
    return fallback;
  }
}
