/**
 * Android uygulama içi güncelleme köprüsü (RoviaUpdater yerel eklentisi, android/…/RoviaUpdaterPlugin.java).
 * @capacitor/core dinamik yüklenir; tarayıcı kullanıcılarının paketine girmez. Eklenti eski APK'larda yoktur.
 */
import type { PluginListenerHandle } from "@capacitor/core";
import { installedFromUserAgent, type InstalledVersion } from "@/lib/app-update/version";

type UpdaterPlugin = {
  getVersion(): Promise<{ versionCode: number; versionName: string; canInstall: boolean }>;
  downloadAndInstall(o: { url: string }): Promise<{ status: "installing" | "permission" }>;
  addListener(event: "updateProgress", cb: (e: { percent: number; bytes: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: "updateStatus", cb: (e: { status: "installing" | "permission_denied" }) => void): Promise<PluginListenerHandle>;
};

type CapacitorGlobal = { isPluginAvailable?: (name: string) => boolean };

let pluginPromise: Promise<UpdaterPlugin> | null = null;

export function hasNativeUpdater(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isPluginAvailable?.("RoviaUpdater"));
}

export function updater(): Promise<UpdaterPlugin> {
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => registerPlugin<UpdaterPlugin>("RoviaUpdater"));
  return pluginPromise;
}

/** Kurulu sürüm: önce eklenti, yoksa WebView UA eki. İkisi de yoksa (eski APK) null. */
export async function installedVersion(): Promise<InstalledVersion | null> {
  if (hasNativeUpdater()) {
    try {
      const v = await (await updater()).getVersion();
      if (Number.isSafeInteger(v.versionCode)) return { versionCode: v.versionCode, versionName: v.versionName ?? null };
    } catch {
      // UA'ya düş
    }
  }
  return installedFromUserAgent(typeof navigator === "undefined" ? null : navigator.userAgent);
}
