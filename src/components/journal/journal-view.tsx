"use client";
import { useMemo, useState } from "react";
import type { JournalNote, MediaItem, TripOption } from "@/lib/journal/types";
import { formatDate } from "@/lib/format";
import { t } from "@/i18n";
import { JournalTimeline } from "./journal-timeline";
import { PhotoGrid } from "./photo-gallery";
import { PhotoUploader } from "./photo-uploader";
import { Tabs } from "./trip-journal";

const NONE = "__none__";
const matchTrip = (filter: string, tripId: string | null) => !filter || (filter === NONE ? tripId === null : tripId === filter);

/** Seyahat Günlüğüm: tüm yolculukların notları ve fotoğrafları; yolculuğa göre süzülebilir. */
export function JournalView({ userId, notes, media, trips }: { userId: string; notes: JournalNote[]; media: MediaItem[]; trips: TripOption[] }) {
  const [tab, setTab] = useState<"timeline" | "gallery">("timeline");
  const [trip, setTrip] = useState<string>("");

  const fNotes = useMemo(() => notes.filter((n) => matchTrip(trip, n.tripId)), [notes, trip]);
  const fMedia = useMemo(() => media.filter((m) => matchTrip(trip, m.tripId)), [media, trip]);
  const selectedTrip = trip && trip !== NONE ? trip : null;

  // Fotoğrafları yolculuğa göre grupla (galeri)
  const groups = useMemo(() => {
    const titles = new Map(trips.map((tr) => [tr.id, tr.title]));
    const map = new Map<string, MediaItem[]>();
    for (const m of fMedia) {
      const k = m.tripId ?? NONE;
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [...map.entries()].map(([k, items]) => ({ key: k, title: k === NONE ? t.journal.noTrip : (titles.get(k) ?? t.journal.trip), items }));
  }, [fMedia, trips]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm font-semibold text-stone-600">
          {t.journal.trip}
          <select value={trip} onChange={(e) => setTrip(e.target.value)} aria-label={t.journal.trip} data-testid="journal-trip-filter"
            className="h-11 min-w-0 flex-1 rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem] font-normal text-ink-900 outline-none focus:border-ink-700 sm:w-72 sm:flex-none">
            <option value="">{t.journal.allTrips}</option>
            {trips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}{tr.date ? ` · ${formatDate(tr.date)}` : ""}</option>)}
            <option value={NONE}>{t.journal.noTrip}</option>
          </select>
        </label>
        <div className="sm:ml-auto sm:w-80"><Tabs tab={tab} onTab={setTab} counts={{ timeline: fNotes.length, gallery: fMedia.length }} /></div>
      </div>

      {tab === "timeline" ? (
        <JournalTimeline key={trip} userId={userId} notes={fNotes} media={media} tripId={selectedTrip} trips={trips} showTrip
          emptyText={trip ? t.journal.emptyFiltered : t.journal.empty} />
      ) : (
        <div className="space-y-6">
          <PhotoUploader key={trip} userId={userId} tripId={selectedTrip} />
          {groups.length === 0 ? <p className="text-sm text-stone-600">{t.journal.emptyGallery}</p> : groups.map((g) => (
            <section key={g.key} className="space-y-2" aria-label={g.title}>
              <h2 className="text-sm font-bold">{g.title} <span className="font-normal text-stone-500">· {t.journal.photoCount(g.items.length)}</span></h2>
              <PhotoGrid media={g.items} tripId={g.key === NONE ? null : g.key} className="sm:grid-cols-6" label={g.title} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
