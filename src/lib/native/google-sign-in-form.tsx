"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle, googleSignInUrlForNative } from "@/lib/actions/auth";
import { isNativeApp } from "@/lib/platform";

/**
 * Google ile giriş formu. Tarayıcıda olağan sunucu eylemi (yönlendirme) çalışır.
 * Android uygulamasında Google WebView içi girişi engellediği için adres sistem tarayıcısında
 * (Custom Tab, @capacitor/browser) açılır; dönüş App Link ile uygulamaya gelir (MainActivity).
 */
export function GoogleSignInForm({ next, children }: { next?: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!isNativeApp()) return; // web: form action olduğu gibi çalışır
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { url, external } = await googleSignInUrlForNative(new FormData(e.currentTarget));
      if (!external) {
        router.push(url); // hata/devre dışı: giriş sayfasındaki mesaj
        return;
      }
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, toolbarColor: "#0e1726" });
    } catch {
      router.push("/giris?error=oauth");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={signInWithGoogle} onSubmit={onSubmit} aria-busy={busy}>
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset disabled={busy} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
