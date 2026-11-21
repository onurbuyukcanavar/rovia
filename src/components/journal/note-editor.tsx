"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı küçük görseller */
import { Check, LoaderCircle, MapPin, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { PlaceSearch } from "@/components/map/place-search";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { saveJournalNote } from "@/lib/actions/journal";
import { NOTE_KINDS, type JournalNote, type MediaItem, type NoteKind, type TripOption } from "@/lib/journal/types";
import type { Stop } from "@/lib/maps/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { PhotoUploader } from "./photo-uploader";

/** Ortak form alanı görünümü (tema token'ları; bkz. src/components/ui/field.tsx) */
export const fieldClass = inputClass(false, "px-3");

/** ISO zaman → <input type="datetime-local"> değeri (yerel saat) */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  userId: string;
  /** Sabit yolculuk (yolculuk sayfası) ya da seçilebilir yolculuklar (Seyahat Günlüğüm) */
  tripId: string | null;
  trips?: TripOption[];
  media: MediaItem[];
  note?: JournalNote | null;
  defaultNotedAt?: string | null;
  onDone: (message: string | null) => void;
};

export function NoteEditor({ userId, tripId: fixedTrip, trips, media, note = null, defaultNotedAt = null, onDone }: Props) {
  const [tripId, setTripId] = useState<string | null>(note?.tripId ?? fixedTrip);
  const [kind, setKind] = useState<NoteKind>(note?.kind ?? "note");
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [notedAt, setNotedAt] = useState(toLocalInput(note?.notedAt ?? defaultNotedAt ?? new Date().toISOString()));
  const [place, setPlace] = useState<Stop | null>(
    note?.lat != null && note.lng != null
      ? { id: `note:${note.id}`, label: note.locationName ?? "", address: null, ref: null, location: { lat: note.lat, lng: note.lng } }
      : null,
  );
  const [selected, setSelected] = useState<string[]>(note?.mediaIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Seçilebilecek fotoğraflar: bu yolculuğun (yoksa yolculuksuz) fotoğrafları + nottakiler
  const choices = useMemo(
    () => media.filter((m) => m.tripId === tripId || selected.includes(m.id)),
    [media, tripId, selected],
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 30 ? s : [...s, id]));
  }

  function save() {
    setError(null);
    const at = notedAt ? new Date(notedAt) : null;
    start(async () => {
      const r = await saveJournalNote({
        id: note?.id ?? null,
        tripId,
        kind,
        title: title.trim() || null,
        body: body.trim() || null,
        notedAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
        locationName: place?.label.slice(0, 200) || null,
        lat: place?.location.lat ?? null,
        lng: place?.location.lng ?? null,
        savedPlaceId: null,
        mediaIds: selected,
      });
      if (!r.ok) setError(r.message);
      else onDone(t.journal.saved);
    });
  }

  return (
    <form className="space-y-4 rounded-[var(--radius-card)] border border-accent/40 bg-raised p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="note-editor"
      onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div className="flex items-start justify-between gap-2">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">{t.journal.kinds.note}</legend>
          {NOTE_KINDS.map((k) => (
            <label key={k} className={cn(
              "relative cursor-pointer rounded-full border px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/25",
              kind === k ? "border-fg bg-fg text-surface" : "border-line-strong bg-raised text-fg",
            )}>
              <input type="radio" name={`kind-${note?.id ?? "new"}`} value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {t.journal.kinds[k]}
            </label>
          ))}
        </fieldset>
        <button type="button" onClick={() => onDone(null)} aria-label={t.common.cancel} className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-fg/[0.06]">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <p className="-mt-2 text-xs text-fg-muted">{t.journal.kindHints[kind]}</p>

      {trips && (
        <div className="space-y-1.5">
          <label htmlFor="note-trip" className="block text-sm font-semibold text-fg">{t.journal.trip}</label>
          <select id="note-trip" className={cn(fieldClass, "h-11")} value={tripId ?? ""} onChange={(e) => setTripId(e.target.value || null)}>
            <option value="">{t.journal.noTrip}</option>
            {trips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="note-title" className="block text-sm font-semibold text-fg">{t.journal.noteTitle}</label>
        <input id="note-title" className={cn(fieldClass, "h-11")} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="note-body" className="block text-sm font-semibold text-fg">{t.journal.noteBody}</label>
        <textarea id="note-body" rows={4} className={cn(fieldClass, "py-2 leading-relaxed")} value={body} maxLength={10000}
          placeholder={t.journal.bodyPlaceholder} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="note-at" className="block text-sm font-semibold text-fg">{t.journal.notedAt}</label>
        <input id="note-at" type="datetime-local" className={cn(fieldClass, "h-11")} value={notedAt} onChange={(e) => setNotedAt(e.target.value)} />
      </div>

      {(kind === "visit" || place) && (
        <div className="space-y-1.5">
          <PlaceSearch label={kind === "visit" ? t.journal.placeSearch : t.journal.place} value={place} onSelect={setPlace}
            marker={<MapPin className="size-4 text-accent-ink" />}
            actions={place ? (
              <button type="button" onClick={() => setPlace(null)} className="text-xs font-semibold text-fg-muted underline">{t.journal.removePlace}</button>
            ) : undefined} />
        </div>
      )}

      <section className="space-y-2" aria-labelledby="note-photos">
        <h3 id="note-photos" className="text-sm font-semibold text-fg">{t.journal.attachPhotos}</h3>
        <p className="text-xs text-fg-muted">{t.journal.attachHint}</p>
        {choices.length > 0 && (
          <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6" data-testid="note-photo-choices">
            {choices.map((m) => {
              const on = selected.includes(m.id);
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => toggle(m.id)} aria-pressed={on}
                    className={cn("relative block aspect-square w-full overflow-hidden rounded-lg border-2", on ? "border-accent" : "border-transparent opacity-80")}>
                    {m.thumbUrl && <img src={m.thumbUrl} alt={m.caption ?? ""} className="size-full object-cover" />}
                    {on && <span className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-accent text-accent-fg"><Check className="size-3.5" aria-hidden /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected.length > 0 && <p className="text-xs font-semibold text-fg-muted">{t.journal.selectedPhotos(selected.length)}</p>}
        <PhotoUploader userId={userId} tripId={tripId} compact
          onUploaded={(ids) => setSelected((s) => [...s, ...ids.filter((id) => !s.includes(id))].slice(0, 30))} />
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {t.journal.save}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>{t.common.cancel}</Button>
      </div>
    </form>
  );
}
