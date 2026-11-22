/**
 * Google Identity Services (GIS) yükleyicisi. Betik yalnızca Google düğmesi bulunan sayfalarda (giriş/kayıt),
 * bileşen bağlandığında tembel olarak eklenir; diğer sayfaların yüküne ve ilk JS paketine girmez.
 * CSP: src/lib/security/headers.ts (script-src …/gsi/client, style-src …/gsi/style, frame-src ve connect-src …/gsi/).
 */
import type { GisButtonConfig } from "./google-id";

export const GIS_SRC = "https://accounts.google.com/gsi/client";
const LOAD_TIMEOUT_MS = 8000;

export type GisCredentialResponse = { credential?: string; select_by?: string };

export type GisInitConfig = {
  client_id: string;
  callback: (r: GisCredentialResponse) => void;
  nonce: string;
  ux_mode: "popup";
  auto_select: boolean;
  cancel_on_tap_outside: boolean;
  context: "signin" | "signup";
  itp_support: boolean;
  use_fedcm_for_prompt: boolean;
};

export type GisId = {
  initialize(config: GisInitConfig): void;
  renderButton(parent: HTMLElement, options: GisButtonConfig): void;
  prompt(): void;
  cancel(): void;
  disableAutoSelect(): void;
};

type GoogleGlobal = { google?: { accounts?: { id?: GisId } } };

const existing = (): GisId | null => (globalThis as unknown as GoogleGlobal).google?.accounts?.id ?? null;

let loading: Promise<GisId> | null = null;

/** GIS'i yükler; engellenir/çevrimdışı/zaman aşımında reddeder (çağıran OAuth akışına düşer). */
export function loadGis(): Promise<GisId> {
  const ready = existing();
  if (ready) return Promise.resolve(ready);
  if (typeof document === "undefined") return Promise.reject(new Error("no_document"));
  loading ??= new Promise<GisId>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => fail(new Error("gis_timeout")), LOAD_TIMEOUT_MS);
    function done() {
      clearTimeout(timer);
      const id = existing();
      if (id) resolve(id);
      else fail(new Error("gis_missing"));
    }
    function fail(err: Error) {
      clearTimeout(timer);
      script?.remove();
      loading = null; // sonraki sayfa açılışında yeniden denenebilsin
      reject(err);
    }
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => fail(new Error("gis_load_error")), { once: true });
  });
  return loading;
}
