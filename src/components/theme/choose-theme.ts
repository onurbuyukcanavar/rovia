"use client";
import { saveThemePreference } from "@/lib/actions/theme";
import { setThemePreference, type ThemePreference } from "@/lib/theme/theme";

/** Kullanıcının seçimi: cihazda hemen uygular, ardından hesaba yazar (diğer cihazlar açılışta bunu alır). */
export function chooseTheme(pref: ThemePreference) {
  setThemePreference(pref);
  saveThemePreference(pref).catch(() => {});
}
