"use client";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type FormState } from "@/lib/actions/auth";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";

export function ResetRequestForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, { status: "idle" });
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label={t.auth.email} name="email" type="email" autoComplete="email" required
        defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <SubmitButton size="lg" className="w-full" pendingLabel={t.common.loading}>{t.auth.resetSend}</SubmitButton>
    </form>
  );
}

export function NewPasswordForm({ submitLabel = t.auth.newPasswordSave, onDoneHref = "/panel" }: { submitLabel?: string; onDoneHref?: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, { status: "idle" });
  if (state.status === "success") {
    return (
      <div className="space-y-4">
        <Alert tone="success">{state.message}</Alert>
        {onDoneHref && <ButtonLink href={onDoneHref} className="w-full">{t.nav.overview}</ButtonLink>}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone="error">{state.message}</Alert>}
      <Field label={t.auth.newPassword} name="password" type="password" autoComplete="new-password" required
        hint={t.auth.passwordHint} error={state.fieldErrors?.password} />
      <Field label={t.auth.newPasswordConfirm} name="confirm" type="password" autoComplete="new-password" required
        error={state.fieldErrors?.confirm} />
      <SubmitButton className="w-full" pendingLabel={t.common.saving}>{submitLabel}</SubmitButton>
    </form>
  );
}
