"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı kapak görseli */
import { Camera, NotebookPen, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ArchiveTrip } from "@/lib/journal/types";
import { routePreviewPath } from "@/lib/journal/route-preview";
import { normalizeForSearch } from "@/lib/places/normalize";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/field";
import { OdometerValue, RouteEnds } from "./route-motif";
import { t } from "@/i18n";

type Sort = "date_desc" | "date_asc" | "distance_desc" | "distance_asc" | "name";

const collator = new Intl.Collator("tr", { sensitivity: "base" });
const time = (v: string | null) => (v ? new Date(v).getTime() : 0);

/** Tamamlanan yolculuklar (arşiv): tarihe, mesafeye ve ada göre sıralama; ad, yer ve açıklamada arama. */
export function CompletedTrips({ trips }: { trips: ArchiveTrip[] }) {
  const [sort, setSort] = useState<Sort>("date_desc");
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = normalizeForSearch(query);
    const list = q
      ? trips.filter((tr) => normalizeForSearch(`${tr.title} ${tr.startLabel ?? ""} ${tr.endLabel ?? ""} ${tr.description ?? ""}`).includes(q))
      : [...trips];
    const by: Record<Sort, (a: ArchiveTrip, b: ArchiveTrip) => number> = {
      date_desc: (a, b) => time(b.endedAt) - time(a.endedAt),
      date_asc: (a, b) => time(a.endedAt) - time(b.endedAt),
      distance_desc: (a, b) => b.distanceM - a.distanceM,
      distance_asc: (a, b) => a.distanceM - b.distanceM,
      name: (a, b) => collator.compare(a.title, b.title),
    };
    return list.sort(by[sort]);
  }, [trips, sort, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <input type="search" aria-label={t.archive.search} placeholder={t.archive.search} value={query} onChange={(e) => setQuery(e.target.value)}
            className={inputClass(false, "h-11 pr-3 pl-9")} />
        </div>
        <label className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg-muted sm:w-64 sm:shrink-0">
          {t.archive.sort}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t.archive.sort} data-testid="archive-sort"
            className={inputClass(false, "h-11 min-w-0 flex-1 px-3 font-normal")}>
            {(Object.keys(t.archive.sorts) as Sort[]).map((k) => <option key={k} value={k}>{t.archive.sorts[k]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-sm text-fg-muted" aria-live="polite">{t.archive.count(shown.length)}</p>
      {shown.length === 0 ? (
        <EmptyState icon={SearchX}>{t.archive.noMatch}</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="completed-list">
          {shown.map((tr) => <ArchiveCard key={tr.id} trip={tr} />)}
        </ul>
      )}
    </div>
  );
}

/** Tamamlanan yolculuk kartı: temalı rota önizlemesi (SVG), rota motifi ve gösterge yazısıyla mesafe/süre. */
function ArchiveCard({ trip }: { trip: ArchiveTrip }) {
  const preview = useMemo(() => routePreviewPath(trip.polyline, 160, 96, 10), [trip.polyline]);
  return (
    <li className="min-w-0">
      <Link href={`/yolculuklar/${trip.id}`} data-testid="completed-card"
        className="card group block h-full overflow-hidden transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-accent/40 motion-reduce:hover:translate-y-0">
        <div className="relative flex h-32 border-b border-line bg-sunken">
          <svg viewBox="0 0 160 96" className={cn("h-full", trip.coverUrl ? "w-1/2" : "w-full")} role="img" aria-label={`${trip.title} rota önizlemesi`}>
            {preview ? (
              <>
                <path d={preview.d} fill="none" className="stroke-surface" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={preview.d} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={preview.start[0]} cy={preview.start[1]} r="3.5" className="fill-surface stroke-fg" strokeWidth="1.5" />
                <circle cx={preview.end[0]} cy={preview.end[1]} r="3.5" className="fill-accent stroke-surface" strokeWidth="1.5" />
              </>
            ) : (
              <text x="80" y="52" textAnchor="middle" className="fill-fg-subtle" fontSize="9">—</text>
            )}
          </svg>
          {trip.coverUrl && <img src={trip.coverUrl} alt="" loading="lazy" className="h-full w-1/2 object-cover" />}
        </div>
        <div className="p-4 sm:p-5">
          <p className="text-xs text-fg-subtle tabular-nums">{formatDate(trip.endedAt)}</p>
          <p className="mt-1 text-lg leading-snug font-medium tracking-tight break-words text-fg group-hover:text-accent-ink">{trip.title}</p>
          {(trip.startLabel || trip.endLabel) && (
            <div className="mt-4">
              <RouteEnds from={trip.startLabel ?? "—"} to={trip.endLabel ?? "—"} />
            </div>
          )}
          <p className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 leading-none font-extralight tracking-[-0.03em] tabular-nums">
            <span className="text-2xl"><OdometerValue value={formatDistance(trip.distanceM)} accent /></span>
            <span className="text-xl"><OdometerValue value={formatDuration(trip.elapsedS)} /></span>
          </p>
          {(trip.photoCount > 0 || trip.noteCount > 0) && (
            <p className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-fg-muted">
              {trip.photoCount > 0 && <span className="inline-flex items-center gap-1"><Camera className="size-3.5 text-accent-ink" aria-hidden /> {t.journal.photoCount(trip.photoCount)}</span>}
              {trip.noteCount > 0 && <span className="inline-flex items-center gap-1"><NotebookPen className="size-3.5 text-accent-ink" aria-hidden /> {t.journal.noteCount(trip.noteCount)}</span>}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
