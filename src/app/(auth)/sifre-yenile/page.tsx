import type { Metadata } from "next";
import { Suspense } from "react";
import { NewPasswordForm } from "@/components/auth/reset-forms";
import { SetupNotice } from "@/components/setup-notice";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { getCurrentUser } from "@/lib/dal";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.auth.newPasswordTitle };

export default function NewPasswordPage() {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return (
    <>
      <h1 className="text-[2.4rem] leading-[1.05] font-extralight tracking-[-0.03em] text-fg">{t.auth.newPasswordTitle}</h1>
      <div className="mt-8">
        <Suspense fallback={<div className="h-56 animate-pulse rounded-2xl bg-sunken" />}>
          <Body />
        </Suspense>
      </div>
    </>
  );
}

async function Body() {
  // Sıfırlama bağlantısı /auth/confirm üzerinden geçici bir oturum açar
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-4">
        <Alert tone="error">{t.auth.callbackError}</Alert>
        <ButtonLink href="/sifremi-unuttum" variant="secondary" className="w-full">{t.auth.resetSend}</ButtonLink>
      </div>
    );
  }
  return <NewPasswordForm />;
}
