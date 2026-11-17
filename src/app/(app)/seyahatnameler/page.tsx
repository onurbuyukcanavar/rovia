/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı küçük görseller */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpenText, CalendarDays, Images, NotebookPen, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { NewTravelogueButton, type CreatableTrip } from "@/components/travelogue/workspace/new-travelogue";
import { requireUser } from "@/lib/dal";
import { listTravelogues } from "@/lib/queries/travelogue";
import { listArchive } from "@/lib/queries/journal";
import { formatDate } from "@/lib/format";
import type { TravelogueListItem } from "@/lib/travelogue/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.travelogue.pages.list;

export const metadata: Metadata = { title: T.title };

export default function TraveloguesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <Suspense fallback={<ListSkeleton />}>
        <TraveloguesLoader />
      </Suspense>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-6" aria-label={t.common.loading}>
      <PageHeader eyebrow={t.nav.travelogues} title={T.title} description={T.subtitle} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-sand-100" />)}
      </div>
    </div>
  );
}

async function TraveloguesLoader() {
  await requireUser();
  const [items, archive] = await Promise.all([listTravelogues(), listArchive()]);
  const byTrip = new Map(items.filter((i) => i.tripId).map((i) => [i.tripId!, i.id]));
  const trips: CreatableTrip[] = archive.map((a) => ({ id: a.id, title: a.title, date: a.startedAt, travelogueId: byTrip.get(a.id) ?? null }));

  return (
    <>
      <PageHeader eyebrow={t.nav.travelogues} title={T.title} description={T.subtitle}
        actions={items.length > 0 ? <NewTravelogueButton trips={trips} /> : undefined} />
      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-sand-300 px-6 py-12 text-center" data-testid="travelogues-empty">
          <BookOpenText className="mx-auto size-10 text-stone-400" aria-hidden />
          <p className="mx-auto mt-3 max-w-md text-stone-600">{T.empty}</p>
          <div className="mt-5 flex justify-center"><NewTravelogueButton trips={trips} label={T.emptyCta} /></div>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="travelogue-list">
          {items.map((item) => <TravelogueCard key={item.id} item={item} />)}
        </ul>
      )}
    </>
  );
}

function TravelogueCard({ item }: { item: TravelogueListItem }) {
  const range = item.firstVisit
    ? [formatDate(item.firstVisit), item.lastVisit && formatDate(item.lastVisit) !== formatDate(item.firstVisit) ? formatDate(item.lastVisit) : null]
        .filter(Boolean).join(" – ")
    : null;
  return (
    <li data-testid="travelogue-card">
      <Link href={`/seyahatnameler/${item.id}`} aria-label={T.open(item.title)}
        className="group flex h-full overflow-hidden rounded-r-2xl rounded-l-md border border-sand-200 bg-paper-50 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-md">
        {/* Kitap sırtı */}
        <span className="w-2.5 shrink-0 bg-gradient-to-r from-ink-900 to-ink-700" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="relative block aspect-[4/3] bg-sand-100">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center bg-gradient-to-br from-sand-100 to-amber-50">
                <BookOpenText className="size-10 text-stone-400" aria-hidden />
              </span>
            )}
            <Badge className={cn("absolute top-2.5 right-2.5", item.status === "published" ? "bg-success text-white" : "bg-paper/90 text-ink-800")}>
              {T.status[item.status]}
            </Badge>
          </span>
          <span className="flex flex-1 flex-col gap-1.5 p-4">
            <span className="font-serif text-xl leading-snug font-bold group-hover:underline">{item.title}</span>
            {item.subtitle && <span className="line-clamp-2 text-sm text-stone-600">{item.subtitle}</span>}
            <span className="mt-auto space-y-1 pt-2 text-xs text-stone-600">
              <span className="flex items-center gap-1.5"><Route className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{item.tripTitle ?? T.noTrip}</span></span>
              {range && <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5 shrink-0" aria-hidden />{range}</span>}
              <span className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><NotebookPen className="size-3.5" aria-hidden />{T.entries(item.entryCount)}</span>
                <span className="inline-flex items-center gap-1"><Images className="size-3.5" aria-hidden />{T.photos(item.photoCount)}</span>
              </span>
              <span className="block text-stone-500">{T.updated(formatDate(item.updatedAt))}</span>
            </span>
          </span>
        </span>
      </Link>
    </li>
  );
}
