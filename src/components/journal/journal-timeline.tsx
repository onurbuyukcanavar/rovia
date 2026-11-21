"use client";
import { BookHeart, MapPin, NotebookPen, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AddToTravelogue } from "@/components/travelogue/add-to-travelogue";
import { deleteJournalNote } from "@/lib/actions/journal";
import type { JournalNote, MediaItem, NoteKind, TripOption } from "@/lib/journal/types";
import { formatDate, formatTime } from "@/lib/format";
import { t } from "@/i18n";
import { NoteEditor } from "./note-editor";
import { PhotoGrid } from "./photo-gallery";

const KIND_ICON: Record<NoteKind, typeof StickyNote> = { note: StickyNote, memory: BookHeart, visit: MapPin };

type Props = {
  userId: string;
  notes: JournalNote[];
  media: MediaItem[];
  /** Yolculuk sayfasında sabit; Seyahat Günlüğüm'de null ve trips listesi verilir */
  tripId: string | null;
  trips?: TripOption[];
  /** Yeni notun varsayılan zamanı (ör. yolculuğun başlangıcı) */
  defaultNotedAt?: string | null;
  showTrip?: boolean;
  emptyText: string;
};

export function JournalTimeline({ userId, notes, media, tripId, trips, defaultNotedAt, showTrip = false, emptyText }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  // Gün başlıklarıyla gruplama
  const groups = useMemo(() => {
    const out: { day: string; notes: JournalNote[] }[] = [];
    for (const n of notes) {
      const day = formatDate(n.notedAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.notes.push(n);
      else out.push({ day, notes: [n] });
    }
    return out;
  }, [notes]);

  const done = (message: string | null) => {
    setEditing(null);
    setNotice(message);
  };

  return (
    <div className="space-y-4" data-testid="journal-timeline">
      {editing === "new" ? (
        <NoteEditor userId={userId} tripId={tripId} trips={trips} media={media} defaultNotedAt={defaultNotedAt} onDone={done} />
      ) : (
        <Button type="button" variant="accent" size="sm" onClick={() => { setNotice(null); setEditing("new"); }}>
          <Plus className="size-4" aria-hidden /> {t.journal.addNote}
        </Button>
      )}
      {notice && <Alert tone="success">{notice}</Alert>}

      {notes.length === 0 && editing !== "new" ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted" data-testid="journal-empty">
          <NotebookPen className="mx-auto mb-3 size-6 text-accent-ink" aria-hidden />{emptyText}
        </p>
      ) : (
        <ol className="space-y-6" aria-label={t.journal.tabs.timeline}>
          {groups.map((g) => (
            <li key={`${g.day}-${g.notes[0].id}`} className="space-y-3">
              <h3 className="eyebrow-accent sticky top-[calc(var(--mobile-header)+0.5rem)] z-10 -ml-1 w-fit rounded-full border border-line bg-chrome px-3 py-1.5 backdrop-blur lg:top-2">{g.day}</h3>
              <ol className="space-y-3 border-l border-line-strong pl-4">
                {g.notes.map((n) =>
                  editing === n.id ? (
                    <li key={n.id}>
                      <NoteEditor userId={userId} tripId={n.tripId} trips={trips} media={media} note={n} onDone={done} />
                    </li>
                  ) : (
                    <NoteCard key={n.id} note={n} media={n.mediaIds.map((id) => mediaById.get(id)).filter((m): m is MediaItem => !!m)}
                      showTrip={showTrip} onEdit={() => { setNotice(null); setEditing(n.id); }} onDeleted={() => setNotice(t.journal.deleted)} />
                  ),
                )}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NoteCard({ note, media, showTrip, onEdit, onDeleted }: {
  note: JournalNote; media: MediaItem[]; showTrip: boolean; onEdit: () => void; onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [withPhotos, setWithPhotos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const Icon = KIND_ICON[note.kind] ?? StickyNote;

  return (
    <li className="relative rounded-[var(--radius-card)] border border-line bg-raised p-4 shadow-[var(--shadow-card)] sm:p-5" data-testid="journal-note">
      <span className="absolute top-5 -left-[1.66rem] grid size-5 place-items-center rounded-full border-2 border-surface bg-accent text-accent-fg" aria-hidden>
        <Icon className="size-3" />
      </span>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
        <span className="font-semibold text-accent-ink">{t.journal.kinds[note.kind]}</span>
        <span className="tabular-nums">{formatTime(note.notedAt)}</span>
        {showTrip && note.tripId && note.tripTitle && (
          <Link href={`/yolculuklar/${note.tripId}`} className="truncate font-semibold text-fg underline-offset-2 hover:underline">· {note.tripTitle}</Link>
        )}
      </p>
      <h4 className="mt-1 text-lg leading-snug font-semibold tracking-tight text-fg">{note.title ?? (note.body ? null : t.journal.photoOnlyNote)}</h4>
      {note.body && <p className="mt-1.5 max-w-prose font-serif text-[1.08rem] leading-relaxed whitespace-pre-line text-fg/90">{note.body}</p>}
      {note.locationName && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-fg-muted">
          <MapPin className="size-4 shrink-0 text-accent-ink" aria-hidden />
          {note.lat !== null && note.lng !== null ? (
            <a href={`https://www.openstreetmap.org/?mlat=${note.lat}&mlon=${note.lng}#map=16/${note.lat}/${note.lng}`} target="_blank" rel="noopener noreferrer"
              className="underline-offset-2 hover:underline">{note.locationName}</a>
          ) : note.locationName}
        </p>
      )}
      {media.length > 0 && <PhotoGrid media={media} tripId={note.tripId} className="mt-3" label={t.journal.photoCount(media.length)} />}

      {confirming ? (
        <div className="mt-3 space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-3" role="alertdialog" aria-label={t.journal.deleteConfirm}>
          <p className="text-sm font-semibold">{t.journal.deleteConfirm}</p>
          {media.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-accent" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
              {t.journal.deleteWithPhotos}
            </label>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => start(async () => {
              const r = await deleteJournalNote(note.id, withPhotos);
              if (!r.ok) setError(r.message);
              else onDeleted();
            })}>{t.journal.deleteYes}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onEdit}><Pencil className="size-4" aria-hidden /> {t.journal.edit}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}><Trash2 className="size-4" aria-hidden /> {t.journal.delete}</Button>
          {note.lat !== null && note.lng !== null && (
            <AddToTravelogue variant="ghost" place={{
              name: note.locationName ?? note.title ?? t.journal.kinds[note.kind], lat: note.lat, lng: note.lng,
              savedPlaceId: note.savedPlaceId, visitedAt: note.notedAt,
            }} />
          )}
        </div>
      )}
      {error && <Alert tone="error" className="mt-2">{error}</Alert>}
    </li>
  );
}
