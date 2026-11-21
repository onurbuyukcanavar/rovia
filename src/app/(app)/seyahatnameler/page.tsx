import type { Metadata } from "next";
import { Suspense } from "react";
import { BookOpenText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { NewTravelogueButton, type CreatableTrip } from "@/components/travelogue/workspace/new-travelogue";
import { requireUser } from "@/lib/dal";
import { listTravelogues } from "@/lib/queries/travelogue";
import { listArchive } from "@/lib/queries/journal";
import { TravelogueCard } from "@/components/travelogue/travelogue-card";
import { t } from "@/i18n";

const T = t.travelogue.pages.list;

export const metadata: Metadata = { title: T.title };

export default function TraveloguesPage() {
  return (
    <div data-themed className="page-backdrop min-h-full">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
        <Suspense fallback={<ListSkeleton />}>
          <TraveloguesLoader />
        </Suspense>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-6" aria-label={t.common.loading}>
      <PageHeader eyebrow={t.nav.travelogues} title={T.title} description={T.subtitle} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-80 animate-pulse rounded-[var(--radius-card)] bg-sunken" />)}
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
        <div data-testid="travelogues-empty">
          <EmptyState icon={BookOpenText} title={<span className="font-serif text-xl italic">{T.emptyTitle}</span>} action={<NewTravelogueButton trips={trips} label={T.emptyCta} />} className="py-14">
            {T.empty}
          </EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="travelogue-list">
          {items.map((item) => <TravelogueCard key={item.id} item={item} />)}
        </ul>
      )}
    </>
  );
}
