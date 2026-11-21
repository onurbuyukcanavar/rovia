"use client";
import { useEffect } from "react";
import { enterDarkOnly } from "@/lib/theme/theme";

/** Her zaman koyu sayfalar (ana sayfa) için: tarayıcı arayüz rengini sayfa açıkken koyu tutar. */
export function DarkOnly() {
  useEffect(() => enterDarkOnly(), []);
  return null;
}
