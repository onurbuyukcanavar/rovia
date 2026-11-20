"use client";
import { useEffect } from "react";
import { listenForInstallPrompt } from "./install-store";

/** Kök düzende: kurulum istemini erkenden yakalar ve (yalnızca üretimde) servis çalışanını kaydeder. */
export function SwRegister() {
  useEffect(() => {
    listenForInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => { navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}); };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
