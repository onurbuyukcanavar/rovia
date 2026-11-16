"use client";
import { useActionState } from "react";
import { signUpWithPassword, type FormState } from "@/lib/actions/auth";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { t } from "@/i18n";

export function SignupForm() {
  const [state, action] = useActionState<FormState, FormData>(signUpWithPassword, { status: "idle" });
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label={t.auth.fullName} name="fullName" autoComplete="name" defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName} />
      <Field label={t.auth.email} name="email" type="email" autoComplete="email" inputMode="email" required
        defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Field label={t.auth.password} name="password" type="password" autoComplete="new-password" required
        hint={t.auth.passwordHint} error={state.fieldErrors?.password} />
      <SubmitButton size="lg" className="w-full" pendingLabel={t.common.loading}>
        {t.auth.signup}
      </SubmitButton>
      <p className="text-xs leading-relaxed text-stone-600">{t.auth.legal}</p>
    </form>
  );
}
