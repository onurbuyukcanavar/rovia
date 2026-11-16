"use client";
import { useActionState } from "react";
import { updateGpsRetention } from "@/lib/actions/settings";
import type { FormState } from "@/lib/actions/auth";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { t } from "@/i18n";

const ORDER = ["0", "30", "90", "365", "forever"] as const;

export function GpsRetentionForm({ days }: { days: number | null }) {
  const [state, action] = useActionState<FormState, FormData>(updateGpsRetention, { status: "idle" });
  const current = days === null ? "forever" : String(days);
  return (
    <form action={action} className="space-y-4" data-testid="gps-retention-form">
      {state.message && <Alert tone={state.status === "error" ? "error" : "success"}>{state.message}</Alert>}
      <div className="space-y-1.5">
        <label htmlFor="gps-retention" className="block text-sm font-semibold text-ink-800">{t.gpsSettings.retention}</label>
        <select id="gps-retention" name="retention" defaultValue={ORDER.includes(current as (typeof ORDER)[number]) ? current : "90"}
          className="h-12 w-full max-w-xs rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem] outline-none focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25">
          {ORDER.map((k) => <option key={k} value={k}>{t.gpsSettings.options[k]}</option>)}
        </select>
      </div>
      <SubmitButton variant="secondary" pendingLabel={t.common.saving}>{t.common.save}</SubmitButton>
    </form>
  );
}
