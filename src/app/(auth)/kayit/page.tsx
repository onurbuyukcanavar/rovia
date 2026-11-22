import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.auth.signup };

export default function SignupPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return (
    <>
      <h1 className="text-[2.4rem] leading-[1.05] font-extralight tracking-[-0.03em] text-fg">{t.auth.signupTitle}</h1>
      <p className="mt-2 text-fg-muted">{t.auth.signupSubtitle}</p>
      <div className="mt-8">
        <GoogleButton context="signup" />
        <OrDivider />
        <SignupForm />
      </div>
      <p className="mt-6 text-xs leading-relaxed text-fg-muted" data-testid="legal-consent">
        Kaydolarak <Link href="/kullanim-kosullari" className="font-semibold underline">Kullanım Koşulları</Link>&apos;nı kabul etmiş
        olursun. Kişisel verilerinin nasıl işlendiği{" "}
        <Link href="/gizlilik" className="font-semibold underline">Gizlilik Politikası ve KVKK Aydınlatma Metni</Link>&apos;nde açıklanır.
      </p>
      <p className="mt-6 text-xs leading-relaxed text-fg-muted">{t.auth.locationNote}</p>
      <p className="mt-6 text-center text-sm text-fg-muted">
        {t.auth.haveAccount}{" "}
        <Link href="/giris" className="font-semibold text-fg underline-offset-4 hover:underline">{t.auth.login}</Link>
      </p>
    </>
  );
}
