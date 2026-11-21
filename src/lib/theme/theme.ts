/**
 * Tema tercihi: "dark" (Koyu, varsayılan) · "light" (Aydınlık) · "system" (cihazı izle).
 *
 * Tercih `rovia-theme` çerezinde saklanır ve sunucuda OKUNMAZ: kök düzende cookies() okumak
 * cacheComponents/PPR ile tüm uygulamayı dinamik yapardı. Bunun yerine <head> içindeki küçük, eşzamanlı
 * betik (THEME_SCRIPT) çerezi ve prefers-color-scheme'i okuyup ilk boyamadan önce
 * <html data-theme> ve <meta name="theme-color"> değerlerini ayarlar
 * (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md, "Themes").
 *
 * Saf modül: sunucu ve istemci içe aktarabilir; DOM'a dokunan işlevler yalnızca tarayıcıda çağrılır.
 */

export const THEME_COOKIE = "rovia-theme";
export const THEME_PREFERENCES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "dark" | "light";
export const DEFAULT_THEME: ThemePreference = "dark";

/** Tarayıcı arayüz rengi (adres çubuğu, durum çubuğu): kabuk çubuklarının rengiyle aynı. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { dark: "#0a111d", light: "#f7f5f0" };
/** Her zaman koyu sayfaların (ana sayfa) arayüz rengi */
export const DARK_ONLY_THEME_COLOR = "#05080f";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function isThemePreference(v: unknown): v is ThemePreference {
  return typeof v === "string" && (THEME_PREFERENCES as readonly string[]).includes(v);
}

export function parseThemeCookie(cookieHeader: string | null | undefined): ThemePreference {
  const m = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return isThemePreference(v) ? v : DEFAULT_THEME;
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

export function themeCookieString(pref: ThemePreference, secure: boolean): string {
  return `${THEME_COOKIE}=${pref}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * İlk boyamadan önce çalışan betik. Sabit bir dizgedir (kullanıcı girdisi içermez); CSP'deki script-src
 * 'unsafe-inline' (Next.js satır içi RSC betikleri için zaten gerekli; bkz. src/lib/security/headers.ts) kapsamındadır.
 * Ana sayfa ("/") her zaman koyudur: orada yalnızca arayüz rengi koyu yapılır, data-theme tercihi korunur.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement,m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/),p=m?decodeURIComponent(m[1]):"${DEFAULT_THEME}";if(p!=="dark"&&p!=="light"&&p!=="system")p="${DEFAULT_THEME}";var t=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;d.setAttribute("data-theme",t);d.setAttribute("data-theme-pref",p);var c=location.pathname==="/"?"${DARK_ONLY_THEME_COLOR}":t==="light"?"${THEME_COLOR.light}":"${THEME_COLOR.dark}",e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute("content",c)}catch(_){}})()`;

/* ---------------------------------------------------------------- Tarayıcı tarafı */

const listeners = new Set<() => void>();
let darkOnlyDepth = 0;

function systemPrefersDark() {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Çerezdeki tercih (yalnızca tarayıcıda; sunucuda varsayılan). */
export function readThemePreference(): ThemePreference {
  if (typeof document === "undefined") return DEFAULT_THEME;
  return parseThemeCookie(document.cookie);
}

/** <html> üzerindeki etkin tema (sunucuda varsayılan koyu). */
export function readResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function setMetaColor(color: string) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

/** Tercihi <html>'e uygular (çereze yazmaz). */
export function applyThemePreference(pref: ThemePreference = readThemePreference()) {
  const root = document.documentElement;
  const resolved = resolveTheme(pref, systemPrefersDark());
  const changed = root.getAttribute("data-theme") !== resolved || root.getAttribute("data-theme-pref") !== pref;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", pref);
  setMetaColor(darkOnlyDepth > 0 ? DARK_ONLY_THEME_COLOR : THEME_COLOR[resolved]);
  if (changed) listeners.forEach((l) => l());
}

/** Tercihi kaydeder (1 yıl, SameSite=Lax, HTTPS'te Secure) ve sayfayı yenilemeden uygular. */
export function setThemePreference(pref: ThemePreference) {
  document.cookie = themeCookieString(pref, location.protocol === "https:");
  applyThemePreference(pref);
}

/** useSyncExternalStore için: tema değişince haber verir. */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Her zaman koyu sayfa açıkken arayüz rengini koyu tutar; dönen işlev geri alır. */
export function enterDarkOnly() {
  darkOnlyDepth++;
  setMetaColor(DARK_ONLY_THEME_COLOR);
  return () => {
    darkOnlyDepth = Math.max(0, darkOnlyDepth - 1);
    if (darkOnlyDepth === 0) setMetaColor(THEME_COLOR[readResolvedTheme()]);
  };
}
