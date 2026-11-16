"use client";
import { useActionState } from "react";
import { updateProfile } from "@/lib/actions/settings";
import type { FormState } from "@/lib/actions/auth";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { t } from "@/i18n";

export function ProfileForm({ fullName, username }: { fullName: string | null; username: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfile, { status: "idle" });
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.message && <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.auth.fullName} name="fullName" autoComplete="name"
          defaultValue={state.values?.fullName ?? fullName ?? ""} error={state.fieldErrors?.fullName} />
        <Field label={t.settings.username} name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
          defaultValue={state.values?.username ?? username ?? ""} hint={t.settings.usernameHint} error={state.fieldErrors?.username} />
      </div>
      <SubmitButton pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
    </form>
  );
}
