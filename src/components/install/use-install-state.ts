"use client";
import { useSyncExternalStore } from "react";
import { getSnapshot, SERVER_STATE, subscribe, type InstallState } from "./install-store";

/** Kurulum durumu: zaten yüklüyse ya da Android uygulamasının içindeyse `installed: true` */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}
