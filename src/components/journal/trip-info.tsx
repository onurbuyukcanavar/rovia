"use client";
import { LoaderCircle, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { updateTripInfo } from "@/lib/actions/journal";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { fieldClass } from "./note-editor";

/** Tamamlanan yolculuğun adı ve açıklaması (arşivde düzenlenebilir). */
export function TripInfo({ id, title, description }: { id: string; title: string; description: string | null }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [desc, setDesc] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight" data-testid="trip-title">{title}</h1>
        {description && <p className="text-sm leading-relaxed whitespace-pre-line text-stone-700" data-testid="trip-description">{description}</p>}
        <button type="button" onClick={() => { setName(title); setDesc(description ?? ""); setEditing(true); }}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-600 hover:text-ink-900">
          <Pencil className="size-3.5" aria-hidden /> {t.archive.editInfo}
        </button>
      </div>
    );
  }
  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await updateTripInfo({ id, title: name, description: desc.trim() || null });
        if (!r.ok) setError(r.message);
        else setEditing(false);
      });
    }}>
      <div className="space-y-1.5">
        <label htmlFor="trip-name" className="block text-sm font-semibold text-ink-800">{t.trips.name}</label>
        <input id="trip-name" className={cn(fieldClass, "h-11")} value={name} maxLength={160} required onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="trip-desc" className="block text-sm font-semibold text-ink-800">{t.archive.description}</label>
        <textarea id="trip-desc" rows={3} className={cn(fieldClass, "py-2")} value={desc} maxLength={5000}
          placeholder={t.archive.descriptionPlaceholder} onChange={(e) => setDesc(e.target.value)} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="accent" disabled={pending || !name.trim()}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {t.journal.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>{t.common.cancel}</Button>
      </div>
    </form>
  );
}
