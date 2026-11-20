/**
 * Kurulum durumu: `beforeinstallprompt` olayı erken (sayfa yüklenirken) gelebildiği için dinleyici
 * kök düzende (SwRegister) kurulur ve olay modül düzeyinde saklanır. Bileşenler useInstallState() ile okur.
 */
import { isNativeApp, isStandalone, mobileOs } from "@/lib/platform";

export type Os = "ios" | "android" | "other";
export type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export type InstallState = { ready: boolean; installed: boolean; os: Os; canPrompt: boolean; iosNonSafari: boolean };

/** Sunucuda ve hidrasyon sırasında: hiçbir şey gösterme */
export const SERVER_STATE: InstallState = { ready: false, installed: true, os: "other", canPrompt: false, iosNonSafari: false };

/** Kurulum penceresinde hangi içerik gösterilecek (saf; test edilir) */
export type SheetVariant = "android-prompt" | "android-menu" | "ios" | "desktop-prompt" | "desktop";
export function sheetVariant(os: Os, canPrompt: boolean): SheetVariant {
  if (os === "ios") return "ios";
  if (os === "android") return canPrompt ? "android-prompt" : "android-menu";
  return canPrompt ? "desktop-prompt" : "desktop";
}

/** iOS'ta Safari dışı tarayıcılar (Chrome, Firefox, Edge, uygulama içi tarayıcılar) */
export function isIosNonSafari(ua: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua);
}

/** Üst çubuktaki simge: yalnızca telefonda ve henüz yüklenmemişken */
export function showHeaderButton(s: InstallState): boolean {
  return s.ready && !s.installed && s.os !== "other";
}

let deferred: InstallPromptEvent | null = null;
let installedFlag = false;
let snapshot: InstallState | null = null;
let listening = false;
const subscribers = new Set<() => void>();

function compute(): InstallState {
  return {
    ready: true,
    installed: installedFlag || isStandalone() || isNativeApp(),
    os: mobileOs(),
    canPrompt: deferred !== null,
    iosNonSafari: isIosNonSafari(navigator.userAgent),
  };
}

function emit() {
  snapshot = compute();
  for (const fn of subscribers) fn();
}

export function listenForInstallPrompt() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // tarayıcının kendi mini bilgi çubuğu yerine kendi düğmemiz
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installedFlag = true;
    deferred = null;
    emit();
  });
}

export function subscribe(fn: () => void) {
  listenForInstallPrompt();
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function getSnapshot(): InstallState {
  snapshot ??= compute();
  return snapshot;
}

/** Saklanan kurulum istemini gösterir; kabul edilirse true */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // istem yalnızca bir kez kullanılabilir
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "accepted") installedFlag = true;
  emit();
  return outcome === "accepted";
}
