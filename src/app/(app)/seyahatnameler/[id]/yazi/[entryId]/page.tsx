import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EntryEditor } from "@/components/travelogue/entry/entry-editor";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getTravelogue } from "@/lib/queries/travelogue";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.travelogue.pages.entry.heading };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = Promise<{ id: string; entryId: string }>;

export default function EntryPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="mx-auto h-[70dvh] max-w-3xl animate-pulse rounded-2xl bg-sand-100" aria-label={t.common.loading} />}>
      <EntryLoader params={params} />
    </Suspense>
  );
}

async function EntryLoader({ params }: { params: Params }) {
  const { id, entryId } = await params;
  if (!UUID.test(id) || !UUID.test(entryId)) notFound();
  const user = await requireUser();
  const travelogue = await getTravelogue(id);
  const index = travelogue?.entries.findIndex((e) => e.id === entryId) ?? -1;
  if (!travelogue || index < 0) notFound();
  const entries = travelogue.entries;
  return (
    <EntryEditor
      travelogueId={travelogue.id}
      entry={entries[index]}
      media={travelogue.media}
      userId={user.id}
      tripId={travelogue.trip?.id ?? null}
      styleUrl={mapStyleUrl()}
      prevId={entries[index - 1]?.id ?? null}
      nextId={entries[index + 1]?.id ?? null}
      position={{ index, total: entries.length }}
    />
  );
}
