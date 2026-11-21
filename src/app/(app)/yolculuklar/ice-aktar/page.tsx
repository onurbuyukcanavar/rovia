import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TrackImporter, type ImportTarget } from "@/components/tools/track-importer";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/i18n";

const T = t.tools.import;
export const metadata: Metadata = { title: T.metaTitle };

export default function TrackImportPage() {
  return (
    <div data-themed className="page-backdrop min-h-full">
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/yolculuklar" className="inline-flex items-center gap-1 text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> {T.back}
      </Link>
      <PageHeader eyebrow={T.eyebrow} title={T.title} accent={T.accent} description={T.subtitle} />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-[var(--radius-card)] bg-sunken" aria-label={t.common.loading} />}>
        <Importer />
      </Suspense>
    </div>
    </div>
  );
}

async function Importer() {
  await requireUser();
  const supabase = await createClient();
  const [trips, recs] = await Promise.all([
    supabase.from("trips").select("id, title, status").neq("status", "active").order("updated_at", { ascending: false }).limit(300),
    supabase.from("trip_recordings").select("trip_id").neq("status", "cancelled").limit(5000),
  ]);
  if (trips.error) throw new Error(`IMPORT_TARGETS_FAILED: ${trips.error.message}`);
  const recorded = new Set((recs.data ?? []).map((r) => r.trip_id));
  const targets: ImportTarget[] = (trips.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as ImportTarget["status"],
    hasRecording: recorded.has(r.id),
  }));
  return <TrackImporter styleUrl={mapStyleUrl()} targets={targets} />;
}
