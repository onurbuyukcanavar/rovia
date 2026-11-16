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
      <h1 className="text-3xl font-extrabold tracking-tight">{t.auth.signupTitle}</h1>
      <p className="mt-2 text-stone-600">{t.auth.signupSubtitle}</p>
      <div className="mt-8">
        <GoogleButton />
        <OrDivider />
        <SignupForm />
      </div>
      <p className="mt-6 text-xs leading-relaxed text-stone-600" data-testid="legal-consent">
        Kaydolarak <Link href="/kullanim-kosullari" className="font-semibold underline">Kullanım Koşulları</Link>&apos;nı kabul etmiş
        olursun. Kişisel verilerinin nasıl işlendiği{" "}
        <Link href="/gizlilik" className="font-semibold underline">Gizlilik Politikası ve KVKK Aydınlatma Metni</Link>&apos;nde açıklanır.
      </p>
      <p className="mt-6 text-xs leading-relaxed text-stone-600">{t.auth.locationNote}</p>
      <p className="mt-6 text-center text-sm text-stone-600">
        {t.auth.haveAccount}{" "}
        <Link href="/giris" className="font-semibold text-ink-900 underline-offset-4 hover:underline">{t.auth.login}</Link>
      </p>
    </>
  );
}
