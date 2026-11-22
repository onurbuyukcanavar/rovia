/**
 * Android yerel Google girişi köprüsü (RoviaGoogleAuth eklentisi, android/…/RoviaGoogleAuthPlugin.java):
 * Credential Manager "Sign in with Google" → Google kimlik belirteci. Eklenti 1.0.8 ve öncesi APK'larda yoktur;
 * o durumda çağıran Custom Tab OAuth akışını kullanır. @capacitor/core dinamik yüklenir (tarayıcı paketine girmez).
 */
type GoogleAuthPlugin = {
  /** nonce: Google'a verilecek değer (ham nonce'un SHA-256 onaltılık özeti) */
  signIn(o: { serverClientId: string; nonce: string }): Promise<{ idToken: string }>;
};

type CapacitorGlobal = { isPluginAvailable?: (name: string) => boolean };

let pluginPromise: Promise<GoogleAuthPlugin> | null = null;

export function hasNativeGoogleAuth(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isPluginAvailable?.("RoviaGoogleAuth"));
}

export function nativeGoogleAuth(): Promise<GoogleAuthPlugin> {
  pluginPromise ??= import("@capacitor/core").then(({ registerPlugin }) => registerPlugin<GoogleAuthPlugin>("RoviaGoogleAuth"));
  return pluginPromise;
}

/** Capacitor ret hatasından eklentinin kodunu çıkarır ("canceled", "no_credential", …). */
export function nativeErrorCode(e: unknown): string | null {
  if (e && typeof e === "object") {
    const { code, message } = e as { code?: unknown; message?: unknown };
    if (typeof code === "string" && code && code !== "UNIMPLEMENTED") return code;
    if (typeof message === "string" && /^[a-z_]+$/.test(message)) return message;
  }
  return null;
}
