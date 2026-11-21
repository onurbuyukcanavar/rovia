"use client";
import { useLayoutEffect } from "react";
import { applyThemePreference, readThemePreference } from "@/lib/theme/theme";

/**
 * Kök düzende bir kez: <head> betiğinin ayarladığı temayı korur ve "Sistem" seçiliyken cihaz değişimini izler.
 * - Geliştirmede Strict Mode <html> özniteliklerini sıfırlayabilir: boyamadan önce yeniden uygulanır (üretimde etkisiz).
 * - Başka sekmede değişen tercih, sekmeye dönünce uygulanır.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyThemePreference();
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readThemePreference() === "system") applyThemePreference("system");
    };
    const onFocus = () => applyThemePreference();
    mq.addEventListener("change", onSystem);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      mq.removeEventListener("change", onSystem);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);
  return null;
}
