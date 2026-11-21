"use client";
import { CircleCheck, LoaderCircle, Save } from "lucide-react";
import { Field, inputClass, labelClass } from "@/components/ui/field";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import type { TripFields } from "@/lib/maps/trip-draft";
import { t } from "@/i18n";

type Props = {
  /** Numaralı üst başlık sırası */
  index?: number;
  fields: TripFields;
  onChange: (fields: TripFields) => void;
  titleSuggestion: string | null;
  fieldErrors: Record<string, string>;
};

/** Yolculuk adı, tarihi ve açıklaması. */
export function TripDetailsForm({ index, fields, onChange, titleSuggestion, fieldErrors }: Props) {
  const set = (patch: Partial<TripFields>) => onChange({ ...fields, ...patch });
  return (
    <section aria-labelledby="trip-details" className="space-y-4">
      <SectionEyebrow as="h2" id="trip-details" index={index}>{t.trips.details}</SectionEyebrow>
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
        <label htmlFor="f-tripDescription" className={labelClass}>{t.trips.description}</label>
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
          className={inputClass(!!fieldErrors.description, "resize-y px-4 py-3")}
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
    <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-line bg-chrome px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6" data-testid="trip-save-bar">
      {error && <Alert tone="error">{error}</Alert>}
      {!error && note && <Alert>{note}</Alert>}
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-fg-muted" role="status" aria-live="polite" data-testid="trip-save-status">
          {saving ? (
            <span className="flex items-center gap-1.5"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.trips.saving}</span>
          ) : blockedReason ? (
            blockedReason
          ) : dirty ? (
            <span className="font-semibold text-accent-ink">{t.trips.unsaved}</span>
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
