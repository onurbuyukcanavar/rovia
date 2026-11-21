"use client";
import { useEffect, useState, type ComponentType } from "react";
import { isNativeApp } from "@/lib/platform";

/**
 * Güncelleme bildirimini yalnızca Android uygulamasında yükler: tarayıcı kullanıcılarının paketine
 * (harita sayfalarının boyut bütçesi) girmez.
 */
export function AppUpdateMount() {
  const [Notice, setNotice] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void import("./app-update-notice").then((m) => {
      if (!cancelled) setNotice(() => m.AppUpdateNotice);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return Notice ? <Notice /> : null;
}
