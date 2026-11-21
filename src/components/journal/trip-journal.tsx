"use client";
import { useState } from "react";
import type { JournalNote, MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { JournalTimeline } from "./journal-timeline";
import { PhotoGrid } from "./photo-gallery";
import { PhotoUploader } from "./photo-uploader";

type Tab = "timeline" | "gallery";

/** Yolculuk detayındaki Seyahat Günlüğü: notlar (kronolojik) ve fotoğraflar. */
export function TripJournal({ userId, tripId, notes, media, startedAt }: {
  userId: string; tripId: string; notes: JournalNote[]; media: MediaItem[]; startedAt: string | null;
}) {
  const [tab, setTab] = useState<Tab>("timeline");
  return (
    <section className="space-y-4" aria-labelledby="trip-journal-title" data-testid="trip-journal">
      <h2 id="trip-journal-title" className="text-lg font-bold text-fg">{t.journal.sectionTitle}</h2>
      <Tabs tab={tab} onTab={setTab} counts={{ timeline: notes.length, gallery: media.length }} />
      {tab === "timeline" ? (
        <JournalTimeline userId={userId} notes={notes} media={media} tripId={tripId} defaultNotedAt={startedAt} emptyText={t.journal.emptyTrip} />
      ) : (
        <div className="space-y-4">
          <PhotoUploader userId={userId} tripId={tripId} />
          {media.length ? <PhotoGrid media={media} tripId={tripId} label={t.journal.tabs.gallery} />
            : <p className="text-sm text-fg-muted">{t.journal.emptyGallery}</p>}
        </div>
      )}
    </section>
  );
}

export function Tabs({ tab, onTab, counts }: { tab: Tab; onTab: (t: Tab) => void; counts: Record<Tab, number> }) {
  return (
    <div className="flex gap-1 rounded-full border border-line bg-sunken p-1" role="tablist">
      {(["timeline", "gallery"] as const).map((k) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => onTab(k)}
          className={cn("flex-1 rounded-full px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-fg text-surface" : "text-fg-muted hover:text-fg")}>
          {t.journal.tabs[k]} <span className="tabular-nums opacity-70">{counts[k]}</span>
        </button>
      ))}
    </div>
  );
}
