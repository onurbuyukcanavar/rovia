"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle, googleSignInUrlForNative } from "@/lib/actions/auth";
import { googleIdTokenErrorMessage } from "@/lib/auth-errors";
import { loadGis, type GisCredentialResponse, type GisId } from "@/lib/auth/gis";
import {
  chooseGoogleSignInMethod, createGoogleNonce, gisButtonConfig, idTokenErrorFallsBack, nativeGoogleErrorOutcome,
  shouldLoadGis, type GoogleNonce,
} from "@/lib/auth/google-id";
import { googleClientId } from "@/lib/env";
import { hasNativeGoogleAuth, nativeErrorCode, nativeGoogleAuth } from "@/lib/native/google-auth";
import { isNativeApp } from "@/lib/platform";
import { safeNextPath } from "@/lib/routes";
import { readResolvedTheme, subscribeTheme } from "@/lib/theme/theme";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";

type Props = {
  next?: string;
  /** Google düğmesindeki metin: "… ile devam et" / "… ile kaydol" */
  context?: "signin" | "signup";
  /** Google One Tap istemi (varsayılan kapalı) */
  oneTap?: boolean;
  /** Yedek düğme (OAuth yönlendirmesi / Android'de yerel giriş ya da Custom Tab) */
  children: ReactNode;
};

type IdTokenResult = "ok" | "error" | "fallback";

/**
 * Google ile giriş.
 * - Tarayıcı + NEXT_PUBLIC_GOOGLE_CLIENT_ID: Google Identity Services resmî düğmesi; kimlik belirteci tarayıcıdaki
 *   Supabase istemcisiyle signInWithIdToken'a verilir (@supabase/ssr çerezleri yazar), sonra `next` adresine gidilir.
 *   Google'ın hesap seçicisi site adını (roviaroad.com) gösterir.
 * - Android uygulaması + RoviaGoogleAuth eklentisi: yerel Credential Manager hesap seçicisi, aynı belirteç akışı.
 * - Diğer her durumda (kimlik yok, GIS engellendi/çevrimdışı, eski APK, yapılandırma hatası) eski akış:
 *   tarayıcıda sunucu eylemi (Supabase OAuth yönlendirmesi), Android'de Custom Tab + App Link dönüşü.
 */
export function GoogleSignInForm({ next, context = "signin", oneTap = false, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gis, setGis] = useState<GisId | null>(null);
  const [gisFailed, setGisFailed] = useState(false);
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const gisRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef(safeNextPath(next));
  const nonceRef = useRef<GoogleNonce | null>(null);
  useEffect(() => {
    nextRef.current = safeNextPath(next);
  }, [next]);

  /** Belirteci Supabase oturumuna çevirir; başarıda tam sayfa geçişiyle hedefe gider. */
  async function completeWithIdToken(token: string, rawNonce: string): Promise<IdTokenResult> {
    try {
      const { getBrowserClient } = await import("@/lib/supabase/client");
      const { error: err } = await getBrowserClient().auth.signInWithIdToken({ provider: "google", token, nonce: rawNonce });
      if (err) {
        console.warn("[rovia:uyarı] Google kimlik belirteciyle giriş başarısız:", err.code ?? err.status);
        setError(googleIdTokenErrorMessage(err));
        return idTokenErrorFallsBack(err) ? "fallback" : "error";
      }
      window.location.assign(nextRef.current);
      return "ok";
    } catch {
      setError(t.auth.googleFailed);
      return "fallback";
    }
  }

  // 1) GIS'i yalnızca tarayıcıda ve istemci kimliği varken tembel yükle
  useEffect(() => {
    if (!shouldLoadGis({ clientId: googleClientId, nativeApp: isNativeApp() })) return;
    let cancelled = false;
    loadGis().then(
      (id) => !cancelled && setGis(id),
      () => !cancelled && setGisFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) GIS hazırsa: başlat (her denemede yeni nonce) ve resmî düğmeyi çiz; tema/genişlik değişince yeniden çiz
  const gisActive = Boolean(gis) && !gisFailed;
  useEffect(() => {
    if (!gis || gisFailed || !googleClientId) return;
    const clientId = googleClientId;
    let disposed = false;
    let lastKey = "";

    const render = (force = false) => {
      const el = gisRef.current;
      const width = rootRef.current?.clientWidth ?? 0;
      if (!el || disposed) return;
      const config = gisButtonConfig({ theme: readResolvedTheme(), width, context });
      const key = `${config.theme}:${config.width}`;
      if (!force && key === lastKey) return;
      lastKey = key;
      el.replaceChildren();
      gis.renderButton(el, config);
    };

    const init = async () => {
      const nonce = await createGoogleNonce();
      if (disposed) return;
      nonceRef.current = nonce;
      gis.initialize({
        client_id: clientId,
        callback: onCredential,
        nonce: nonce.hashed,
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        context,
        itp_support: true,
        use_fedcm_for_prompt: true,
      });
    };

    async function onCredential(r: GisCredentialResponse) {
      const nonce = nonceRef.current;
      if (!r.credential || !nonce) return;
      setBusy(true);
      setError(null);
      const result = await completeWithIdToken(r.credential, nonce.raw);
      if (result === "ok") return; // sayfa değişiyor
      setBusy(false);
      if (result === "fallback") {
        setGisFailed(true); // eski OAuth düğmesi görünür; mesaj kalır
        return;
      }
      await init(); // nonce tek kullanımlık: yeni deneme için yenile
      render(true);
    }

    void init().then(() => {
      render(true);
      if (oneTap && !disposed) gis.prompt();
    });
    const unsubscribe = subscribeTheme(() => render());
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => render()) : null;
    if (rootRef.current) ro?.observe(rootRef.current);
    return () => {
      disposed = true;
      unsubscribe();
      ro?.disconnect();
      if (oneTap) gis.cancel();
    };
  }, [gis, gisFailed, context, oneTap]);

  const lastForm = useRef<FormData | null>(null);
  const [nativeRetry, setNativeRetry] = useState(false);

  function diag(step: string, code: string | null, ms: number) {
    // Tanı kaydı: başarısızlığın nedeni sunucu günlüğünde görünsün (kişisel veri yok)
    void fetch("/api/app/diag", {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ step, code: code ?? "none", ms }),
    }).catch(() => {});
  }

  async function continueInBrowser() {
    const fd = lastForm.current;
    if (!fd || busy) return;
    setBusy(true);
    setError(null);
    setNativeRetry(false);
    try {
      await openCustomTab(fd);
    } catch {
      router.push("/giris?error=oauth");
    } finally {
      setBusy(false);
    }
  }

  async function openCustomTab(fd: FormData) {
    const { url, external } = await googleSignInUrlForNative(fd);
    if (!external) {
      router.push(url); // hata/devre dışı: giriş sayfasındaki mesaj
      return;
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, toolbarColor: "#0e1726" });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!isNativeApp()) return; // tarayıcı: form eylemi (OAuth yönlendirmesi) olduğu gibi çalışır
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    lastForm.current = fd;
    setBusy(true);
    setError(null);
    setNativeRetry(false);
    try {
      const method = chooseGoogleSignInMethod({
        clientId: googleClientId, nativeApp: true, nativePlugin: hasNativeGoogleAuth(), gis: "failed",
      });
      if (method === "native" && googleClientId) {
        const nonce = await createGoogleNonce();
        let idToken: string | null = null;
        const started = Date.now();
        try {
          ({ idToken } = await (await nativeGoogleAuth()).signIn({ serverClientId: googleClientId, nonce: nonce.hashed }));
        } catch (err) {
          const code = nativeErrorCode(err);
          const ms = Date.now() - started;
          diag("signin_error", code, ms);
          if (nativeGoogleErrorOutcome(code, ms) === "silent") {
            // Hesap seçici kapandı: sessiz kalmak yerine açıkla ve tarayıcıyla devam etmeyi öner
            setError(t.auth.googleNativeCanceled);
            setNativeRetry(true);
            return;
          }
          console.warn("[rovia:uyarı] Yerel Google girişi kullanılamadı, tarayıcı akışına geçiliyor:", code);
        }
        if (idToken) diag("signin_ok", null, Date.now() - started);
        if (idToken) {
          const result = await completeWithIdToken(idToken, nonce.raw);
          if (result !== "fallback") return;
        }
      }
      await openCustomTab(fd);
    } catch {
      router.push("/giris?error=oauth");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} data-google-signin={gisActive ? "gis" : "fallback"}>
      {gisActive && (
        // color-scheme: light → Google'ın iframe'i koyu temada opak beyaz zemin almaz (düğme rengi temayı izler)
        <div
          ref={gisRef}
          className="flex min-h-10 justify-center [color-scheme:light] aria-busy:pointer-events-none aria-busy:opacity-60"
          aria-busy={busy}
          aria-label={t.auth.google}
        />
      )}
      {!gisActive && (
        <form action={signInWithGoogle} onSubmit={onSubmit} aria-busy={busy}>
          {next && <input type="hidden" name="next" value={next} />}
          <fieldset disabled={busy} className="contents">
            {children}
          </fieldset>
        </form>
      )}
      {busy && gisActive && <p className="mt-2 text-center text-xs text-fg-muted" role="status">{t.auth.googleLoading}</p>}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {nativeRetry && (
        <Button type="button" variant="secondary" className="mt-3 w-full" onClick={continueInBrowser} disabled={busy}>
          {t.auth.googleContinueInBrowser}
        </Button>
      )}
    </div>
  );
}
