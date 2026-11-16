import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth/reset-forms";
import { SetupNotice } from "@/components/setup-notice";
import { isSupabaseConfigured } from "@/lib/env";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.auth.resetTitle };

export default function ForgotPasswordPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{t.auth.resetTitle}</h1>
      <p className="mt-2 text-stone-600">{t.auth.resetSubtitle}</p>
      <div className="mt-8"><ResetRequestForm /></div>
      <p className="mt-8 text-center text-sm">
        <Link href="/giris" className="font-semibold text-ink-900 hover:underline">← {t.auth.login}</Link>
      </p>
    </>
  );
}
