/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı küçük görseller */
import Link from "next/link";
import { BookOpenText, CalendarDays, Images, NotebookPen, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { TravelogueListItem } from "@/lib/travelogue/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.travelogue.pages.list;

/** Seyahatnameler listesindeki kitap kartı: sırt, kapak (ya da ufuk sahnesi), serif başlık ve künye. */
export function TravelogueCard({ item }: { item: TravelogueListItem }) {
  const range = item.firstVisit
    ? [formatDate(item.firstVisit), item.lastVisit && formatDate(item.lastVisit) !== formatDate(item.firstVisit) ? formatDate(item.lastVisit) : null]
        .filter(Boolean).join(" – ")
    : null;
  return (
    <li data-testid="travelogue-card">
      <Link href={`/seyahatnameler/${item.id}`} aria-label={T.open(item.title)}
        className="group flex h-full overflow-hidden rounded-r-[var(--radius-card)] rounded-l-md border border-line bg-raised shadow-[var(--shadow-card)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
        {/* Kitap sırtı: gömük şerit, ince ayraç ve amber kurdele */}
        <span className="relative w-3 shrink-0 border-r border-line bg-sunken" aria-hidden>
          <span className="absolute inset-y-0 right-0.5 w-px bg-fg/10" />
          <span className="absolute top-0 left-1/2 h-8 w-1 -translate-x-1/2 rounded-b-sm bg-accent/80" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="relative block aspect-[4/3] overflow-hidden bg-sunken">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
            ) : (
              <CoverPlaceholder />
            )}
            <Badge className={cn("absolute top-2.5 right-2.5 backdrop-blur", item.status === "published" ? "bg-success text-surface" : "bg-surface/85 text-fg")}>
              {T.status[item.status]}
            </Badge>
          </span>
          <span className="flex flex-1 flex-col gap-1.5 p-4 sm:p-5">
            <span className="font-serif text-[1.35rem] leading-snug font-normal tracking-[-0.01em] text-balance text-fg group-hover:underline group-hover:decoration-accent/60 group-hover:underline-offset-4">{item.title}</span>
            {item.subtitle && <span className="line-clamp-2 font-serif text-[0.95rem] text-fg-muted italic">{item.subtitle}</span>}
            <span className="mt-auto space-y-1.5 border-t border-line pt-3 text-xs text-fg-muted">
              <span className="flex items-center gap-1.5"><Route className="size-3.5 shrink-0 text-accent-ink" aria-hidden /><span className="truncate">{item.tripTitle ?? T.noTrip}</span></span>
              {range && <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />{range}</span>}
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1"><NotebookPen className="size-3.5 text-fg-subtle" aria-hidden />{T.entries(item.entryCount)}</span>
                <span className="inline-flex items-center gap-1"><Images className="size-3.5 text-fg-subtle" aria-hidden />{T.photos(item.photoCount)}</span>
              </span>
              <span className="block text-fg-subtle">{T.updated(formatDate(item.updatedAt))}</span>
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}

/** Kapak fotoğrafı yoksa: ufka uzanan yol (ana sayfa ve paneldeki sahnenin durağan, küçük yorumu). */
function CoverPlaceholder() {
  return (
    <span className="panel-hero-sky relative grid size-full place-items-center" aria-hidden>
      <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
        <path d="M-40 120 L 78 70 M 200 120 L 82 70" className="stroke-fg/25" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
        <path d="M80 120 L 80 70" className="stroke-accent/70" strokeWidth="1.5" strokeDasharray="6 7" fill="none" vectorEffect="non-scaling-stroke" />
        <path d="M-10 70 L 170 70" className="stroke-fg/10" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <BookOpenText className="relative -mt-8 size-9 text-accent-glow/80" strokeWidth={1.4} />
    </span>
  );
}
