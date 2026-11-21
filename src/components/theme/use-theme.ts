"use client";
import { useSyncExternalStore } from "react";
import {
  DEFAULT_THEME, readResolvedTheme, readThemePreference, subscribeTheme, type ResolvedTheme, type ThemePreference,
} from "@/lib/theme/theme";

/** Kayıtlı tercih (Koyu/Aydınlık/Sistem). Sunucuda ve hidrasyonda varsayılan; ardından gerçek değer. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, readThemePreference, () => DEFAULT_THEME);
}

/** Etkin tema (<html data-theme>). Haritalar gibi CSS dışı renk seçimleri için. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeTheme, readResolvedTheme, () => "dark");
}
