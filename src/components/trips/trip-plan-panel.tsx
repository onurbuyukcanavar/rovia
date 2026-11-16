"use client";
import { CircleCheck, LoaderCircle, Save } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { TripFields } from "@/lib/maps/trip-draft";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Props = {
  fields: TripFields;
  onChange: (fields: TripFields) => void;
  titleSuggestion: string | null;
  fieldErrors: Record<string, string>;
};

/** Yolculuk adı, tarihi ve açıklaması. */
export function TripDetailsForm({ fields, onChange, titleSuggestion, fieldErrors }: Props) {
  const set = (patch: Partial<TripFields>) => onChange({ ...fields, ...patch });
  return (
    <section aria-labelledby="trip-details" className="space-y-4">
      <h2 id="trip-details" className="eyebrow">{t.trips.details}</h2>
      <Field
        label={t.trips.name}
        name="tripTitle"
        value={fields.title}
        maxLength={160}
        placeholder={titleSuggestion ?? t.trips.namePlaceholder}
        onChange={(e) => set({ title: e.target.value })}
        error={fieldErrors.title}
        autoComplete="off"
      />
      <Field
        label={t.trips.date}
        name="tripDate"
        type="date"
        min="2000-01-01"
        max="2100-12-31"
        value={fields.plannedDate}
        onChange={(e) => set({ plannedDate: e.target.value })}
        error={fieldErrors.plannedDate}
        hint={t.trips.dateHint}
      />
      <div className="space-y-1.5">
        <label htmlFor="f-tripDescription" className="block text-sm font-semibold text-ink-800">{t.trips.description}</label>
        <textarea
          id="f-tripDescription"
          name="tripDescription"
          rows={3}
          maxLength={5000}
          value={fields.description}
          placeholder={t.trips.descriptionPlaceholder}
          onChange={(e) => set({ description: e.target.value })}
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? "f-tripDescription-error" : undefined}
          className={cn(
            "w-full resize-y rounded-xl border bg-white px-4 py-3 text-[0.95rem] text-ink-900 transition outline-none placeholder:text-stone-500",
            "focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25",
            fieldErrors.description ? "border-danger/60" : "border-sand-300",
          )}
        />
        {fieldErrors.description && <p id="f-tripDescription-error" className="text-sm text-danger">{fieldErrors.description}</p>}
      </div>
    </section>
  );
}

type SaveBarProps = {
  isNew: boolean;
  dirty: boolean;
  saving: boolean;
  savedAt: string | null;
  blockedReason: string | null;
  note: string | null;
  error: string | null;
  onSave: () => void;
};

/** Planlayıcının altına yapışık kaydetme çubuğu: durum, uyarı ve kaydet düğmesi. */
export function SaveBar({ isNew, dirty, saving, savedAt, blockedReason, note, error, onSave }: SaveBarProps) {
  const time = savedAt
    ? new Date(savedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })
    : null;
  return (
    <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-sand-200 bg-paper/95 px-4 py-3 backdrop-blur lg:-mx-5 lg:px-5" data-testid="trip-save-bar">
      {error && <Alert tone="error">{error}</Alert>}
      {!error && note && <Alert>{note}</Alert>}
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-stone-600" role="status" aria-live="polite" data-testid="trip-save-status">
          {saving ? (
            <span className="flex items-center gap-1.5"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.trips.saving}</span>
          ) : blockedReason ? (
            blockedReason
          ) : dirty ? (
            <span className="font-semibold text-amber-700">{t.trips.unsaved}</span>
          ) : time ? (
            <span className="flex items-center gap-1.5 text-success"><CircleCheck className="size-4" aria-hidden /> {t.trips.savedAt(time)}</span>
          ) : null}
        </p>
        <Button type="button" variant="accent" onClick={onSave} disabled={saving || !!blockedReason || (!dirty && !isNew)}>
          <Save className="size-4" aria-hidden />
          {isNew ? t.trips.save : t.trips.saveChanges}
        </Button>
      </div>
    </div>
  );
}
