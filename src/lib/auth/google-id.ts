/**
 * Google kimlik belirteci (ID token) ile giriş: saf yardımcılar (DOM'a/ağa dokunmaz; birim testlenir).
 *
 * Akış: rastgele ham nonce üretilir; Google'a (GIS `nonce` / Credential Manager `setNonce`) bunun SHA-256 onaltılık
 * özeti verilir, Supabase'e (signInWithIdToken) ham değer. Supabase ham değerin özetini belirteçteki `nonce` ile
 * karşılaştırır; böylece ele geçirilmiş bir belirteç başka bir oturumda yeniden oynatılamaz.
 */

export type GoogleSignInMethod =
  /** Android uygulaması + RoviaGoogleAuth eklentisi: yerel Credential Manager "Sign in with Google" */
  | "native"
  /** Tarayıcı: Google Identity Services düğmesi */
  | "gis"
  /** Android uygulaması, eklenti yok (≤ 1.0.8) ya da istemci kimliği yok: Supabase OAuth, sistem tarayıcısında (Custom Tab) */
  | "oauth-custom-tab"
  /** Tarayıcı, istemci kimliği yok ya da GIS yüklenemedi: Supabase OAuth yönlendirmesi (sunucu eylemi) */
  | "oauth-redirect";

export type GoogleMethodInput = {
  /** NEXT_PUBLIC_GOOGLE_CLIENT_ID (geçerliyse) */
  clientId: string | null;
  /** Capacitor kabuğu içinde mi */
  nativeApp: boolean;
  /** Kurulu APK'da RoviaGoogleAuth eklentisi var mı */
  nativePlugin: boolean;
  /** GIS betiği yüklendi ve düğme çizilebiliyor mu ("loading": henüz bilinmiyor) */
  gis: "loading" | "ready" | "failed";
};

/**
 * Hangi giriş yolunun kullanılacağı. Her belirsizlikte eski (OAuth) akışa düşülür: giriş asla kırılmaz.
 * Android WebView'da GIS hiç denenmez (Google WebView içi girişi engeller).
 */
export function chooseGoogleSignInMethod({ clientId, nativeApp, nativePlugin, gis }: GoogleMethodInput): GoogleSignInMethod {
  if (nativeApp) return clientId && nativePlugin ? "native" : "oauth-custom-tab";
  if (clientId && gis === "ready") return "gis";
  return "oauth-redirect";
}

/** GIS betiği yüklenmeli mi (yalnızca tarayıcıda ve istemci kimliği varken) */
export const shouldLoadGis = ({ clientId, nativeApp }: Pick<GoogleMethodInput, "clientId" | "nativeApp">) =>
  Boolean(clientId) && !nativeApp;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

export type GoogleNonce = { raw: string; hashed: string };

/** 32 bayt (256 bit) kriptografik rastgele ham nonce + SHA-256 özeti. Her giriş denemesi için yenisi üretilir. */
export async function createGoogleNonce(): Promise<GoogleNonce> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = toHex(bytes);
  return { raw, hashed: await sha256Hex(raw) };
}

/** GIS düğme genişliği (piksel): Google en az 200, en çok 400 kabul eder. */
export function gisButtonWidth(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 320;
  return Math.max(200, Math.min(400, Math.floor(containerWidth)));
}

export type GisButtonConfig = {
  type: "standard";
  theme: "outline" | "filled_black";
  size: "large";
  text: "continue_with" | "signup_with" | "signin_with";
  shape: "pill";
  logo_alignment: "left";
  width: number;
  locale: string;
};

/** Google'ın resmî düğmesi: koyu temada filled_black, aydınlıkta outline; Türkçe; hap biçimi. */
export function gisButtonConfig(opts: { theme: "dark" | "light"; width: number; context: "signin" | "signup" }): GisButtonConfig {
  return {
    type: "standard",
    theme: opts.theme === "dark" ? "filled_black" : "outline",
    size: "large",
    text: opts.context === "signup" ? "signup_with" : "continue_with",
    shape: "pill",
    logo_alignment: "left",
    width: gisButtonWidth(opts.width),
    locale: "tr",
  };
}

/**
 * Yerel eklentinin ret kodları (RoviaGoogleAuthPlugin.java). "canceled": kullanıcı kapattı → sessiz.
 * Diğerleri (hesap yok, yapılandırma/Play Hizmetleri sorunu…) → Custom Tab OAuth akışına düşülür.
 */
export type NativeGoogleOutcome = "silent" | "fallback";
export function nativeGoogleErrorOutcome(code: string | undefined | null): NativeGoogleOutcome {
  return code === "canceled" ? "silent" : "fallback";
}

/**
 * Supabase signInWithIdToken hatasından sonra eski OAuth akışına düşülmeli mi?
 * Kullanıcıya özgü/bilinçli durumlar (hesap çakışması, sağlayıcı ya da kayıt kapalı, hız sınırı) mesajla gösterilir;
 * geri kalanı (ör. belirtecin kitlesi Supabase'de tanımlı değil, nonce uyuşmazlığı) yapılandırma sorunu sayılır ve
 * giriş kırılmasın diye OAuth yönlendirmesi kullanılabilir kalır.
 */
const NO_FALLBACK_CODES = new Set([
  "email_exists", "user_already_exists", "identity_already_exists", "provider_disabled", "signup_disabled",
]);
export function idTokenErrorFallsBack(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 429 || error.code?.startsWith("over_")) return false;
  return !(error.code && NO_FALLBACK_CODES.has(error.code));
}
