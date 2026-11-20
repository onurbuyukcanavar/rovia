/**
 * Platform tespiti (yalnızca istemcide anlamlı).
 * - isNativeApp: ROVIA Android uygulaması (Capacitor kabuğu) içinde mi?
 * - isStandalone: Ana ekrana eklenmiş web uygulaması (PWA) olarak mı açıldı?
 * - mobileOs: kurulum yönergeleri için kaba işletim sistemi tespiti.
 */
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

/** GitHub Releases'teki en son APK (Android iş akışı yayımlar) */
export const ANDROID_APK_URL = "https://github.com/onurbuyukcanavar/rovia/releases/latest/download/rovia.apk";
export const ANDROID_PACKAGE = "com.onurbuyukcanavar.rovia";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function mobileOs(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  // iPadOS 13+ masaüstü gibi davranır: dokunmatik Mac = iPad
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "other";
}
