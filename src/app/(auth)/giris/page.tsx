import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { SetupNotice } from "@/components/setup-notice";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.auth.login };

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default function LoginPage({ searchParams }: Props) {
  if (!isSupabaseConfigured) return <SetupNotice />;
  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{t.auth.loginTitle}</h1>
      <p className="mt-2 text-stone-600">{t.auth.loginSubtitle}</p>
      <div className="mt-8">
        <Suspense fallback={<FormSkeleton />}>
          <LoginBody searchParams={searchParams} />
        </Suspense>
      </div>
      <p className="mt-8 text-center text-sm text-stone-600">
        {t.auth.noAccount}{" "}
        <Link href="/kayit" className="font-semibold text-ink-900 underline-offset-4 hover:underline">{t.auth.signup}</Link>
      </p>
    </>
  );
}

async function LoginBody({ searchParams }: Props) {
  const { next: rawNext, error } = await searchParams;
  const next = rawNext ? safeNextPath(rawNext) : undefined;
  return (
    <>
      {error && <Alert tone="error" className="mb-5">{t.auth.callbackError}</Alert>}
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} />
    </>
  );
}

function FormSkeleton() {
  return <div className="h-80 animate-pulse rounded-2xl bg-sand-100" aria-label={t.common.loading} />;
}
