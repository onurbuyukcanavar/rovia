"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı kapak görseli */
import { Camera, NotebookPen, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ArchiveTrip } from "@/lib/journal/types";
import { routePreviewPath } from "@/lib/journal/route-preview";
import { normalizeForSearch } from "@/lib/places/normalize";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Sort = "date_desc" | "date_asc" | "distance_desc" | "distance_asc" | "name";

const collator = new Intl.Collator("tr", { sensitivity: "base" });
const time = (v: string | null) => (v ? new Date(v).getTime() : 0);

/** Yolculuk arşivi: tarihe, mesafeye ve ada göre sıralama; ad, yer ve açıklamada arama. */
export function ArchiveList({ trips }: { trips: ArchiveTrip[] }) {
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
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-500" aria-hidden />
          <input type="search" aria-label={t.archive.search} placeholder={t.archive.search} value={query} onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-xl border border-sand-300 bg-white pr-3 pl-9 text-[0.95rem] outline-none focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25" />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-stone-600">
          {t.archive.sort}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t.archive.sort} data-testid="archive-sort"
            className="h-11 rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem] font-normal text-ink-900 outline-none focus:border-ink-700">
            {(Object.keys(t.archive.sorts) as Sort[]).map((k) => <option key={k} value={k}>{t.archive.sorts[k]}</option>)}
          </select>
        </label>
      </div>
      <p className="text-sm text-stone-600" aria-live="polite">{t.archive.count(shown.length)}</p>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sand-300 p-6 text-center text-sm text-stone-600">{t.archive.noMatch}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="completed-list">
          {shown.map((tr) => <ArchiveCard key={tr.id} trip={tr} />)}
        </ul>
      )}
    </div>
  );
}

function ArchiveCard({ trip }: { trip: ArchiveTrip }) {
  const preview = useMemo(() => routePreviewPath(trip.polyline, 160, 96, 10), [trip.polyline]);
  return (
    <li>
      <Link href={`/yolculuklar/${trip.id}`} className="card block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md" data-testid="completed-card">
        <div className="relative flex h-32 bg-ink-900">
          <svg viewBox="0 0 160 96" className={cn("h-full", trip.coverUrl ? "w-1/2" : "w-full")} role="img" aria-label={`${trip.title} rota önizlemesi`}>
            <rect width="160" height="96" fill="#0e1726" />
            {preview ? (
              <>
                <path d={preview.d} fill="none" stroke="#0e1726" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
                <path d={preview.d} fill="none" stroke="#e8912d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={preview.start[0]} cy={preview.start[1]} r="3.5" fill="#fbf8f2" />
                <circle cx={preview.end[0]} cy={preview.end[1]} r="3.5" fill="#e8912d" stroke="#fbf8f2" strokeWidth="1.5" />
              </>
            ) : (
              <text x="80" y="52" textAnchor="middle" fill="#7b879b" fontSize="9">—</text>
            )}
          </svg>
          {trip.coverUrl && <img src={trip.coverUrl} alt="" loading="lazy" className="h-full w-1/2 object-cover" />}
        </div>
        <div className="p-4">
          <p className="text-lg leading-snug font-bold">{trip.title}</p>
          {(trip.startLabel || trip.endLabel) && (
            <p className="mt-1 truncate text-sm text-stone-600">{[trip.startLabel, trip.endLabel].filter(Boolean).join(" → ")}</p>
          )}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600 tabular-nums">
            <span>{formatDate(trip.endedAt)}</span>
            <span className="font-semibold text-ink-900">{formatDistance(trip.distanceM)}</span>
            <span>{formatDuration(trip.elapsedS)}</span>
          </p>
          {(trip.photoCount > 0 || trip.noteCount > 0) && (
            <p className="mt-2 flex gap-3 text-xs font-semibold text-stone-600">
              {trip.photoCount > 0 && <span className="inline-flex items-center gap-1"><Camera className="size-3.5" aria-hidden /> {t.journal.photoCount(trip.photoCount)}</span>}
              {trip.noteCount > 0 && <span className="inline-flex items-center gap-1"><NotebookPen className="size-3.5" aria-hidden /> {t.journal.noteCount(trip.noteCount)}</span>}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
