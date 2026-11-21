"use client";
import { useEffect } from "react";
import { saveThemePreference } from "@/lib/actions/theme";
import { readThemePreference, setThemePreference, THEME_COOKIE, type ThemePreference } from "@/lib/theme/theme";

/**
 * Hesap ↔ cihaz eşitlemesi (açılışta bir kez):
 * - Hesapta tercih varsa ve cihazdakinden farklıysa hesaptaki uygulanır (başka cihazda yapılan seçim).
 * - Hesapta tercih yoksa ve bu cihazda açıkça seçilmiş bir tema varsa, o hesaba yazılır.
 */
export function AccountThemeSync({ accountPref }: { accountPref: ThemePreference | null }) {
  useEffect(() => {
    const hasDeviceChoice = new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=`).test(document.cookie);
    if (accountPref) {
      if (accountPref !== readThemePreference() || !hasDeviceChoice) setThemePreference(accountPref);
    } else if (hasDeviceChoice) {
      saveThemePreference(readThemePreference()).catch(() => {});
    }
  }, [accountPref]);
  return null;
}
