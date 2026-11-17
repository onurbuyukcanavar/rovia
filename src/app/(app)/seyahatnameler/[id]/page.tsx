import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Workspace } from "@/components/travelogue/workspace/workspace";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getTravelogue } from "@/lib/queries/travelogue";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.nav.travelogues };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function TravelogueWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-app-mobile animate-pulse bg-sand-100 lg:h-dvh" aria-label={t.common.loading} />}>
      <WorkspaceLoader params={params} />
    </Suspense>
  );
}

async function WorkspaceLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();
  const travelogue = await getTravelogue(id);
  if (!travelogue) notFound();
  return <Workspace travelogue={travelogue} userId={user.id} styleUrl={mapStyleUrl()} />;
}
