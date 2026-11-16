import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { JournalView } from "@/components/journal/journal-view";
import { requireUser } from "@/lib/dal";
import { getJournalOverview } from "@/lib/queries/journal";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.journal.title };

export default function JournalPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t.nav.journal} title={t.journal.title} description={t.journal.subtitle} />
      <Suspense fallback={<div className="space-y-3" aria-label={t.common.loading}>{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-sand-100" />)}</div>}>
        <JournalLoader />
      </Suspense>
    </div>
  );
}

async function JournalLoader() {
  const user = await requireUser();
  const { notes, media, trips } = await getJournalOverview();
  return <JournalView userId={user.id} notes={notes} media={media} trips={trips} />;
}
