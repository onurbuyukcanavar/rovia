"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signInWithPassword, type FormState } from "@/lib/actions/auth";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { t } from "@/i18n";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState<FormState, FormData>(signInWithPassword, { status: "idle" });
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label={t.auth.email} name="email" type="email" autoComplete="email" inputMode="email" required
        defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Field label={t.auth.password} name="password" type="password" autoComplete="current-password" required
        error={state.fieldErrors?.password} />
      <div className="flex justify-end">
        <Link href="/sifremi-unuttum" className="text-sm font-semibold text-amber-700 hover:underline">
          {t.auth.forgot}
        </Link>
      </div>
      <SubmitButton size="lg" className="w-full" pendingLabel={t.common.loading}>
        {t.auth.login}
      </SubmitButton>
    </form>
  );
}
