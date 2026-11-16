import type { Metadata } from "next";
import { Suspense } from "react";
import { Recorder } from "@/components/recording/recorder";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getRecordingPageData } from "@/lib/queries/recordings";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.recording.title };

type SearchParams = Promise<{ yolculuk?: string | string[] }>;

export default function RecordingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RecorderSkeleton />}>
      <RecorderLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function RecorderLoader({ searchParams }: { searchParams: SearchParams }) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const { plannedTrips, active } = await getRecordingPageData();
  const preselect = typeof params.yolculuk === "string" ? params.yolculuk : null;
  return (
    <Recorder userId={user.id} styleUrl={mapStyleUrl()} plannedTrips={plannedTrips} serverActive={active} preselectTripId={preselect} />
  );
}

function RecorderSkeleton() {
  return (
    <div className="flex h-[calc(100dvh-3.5rem-4.5rem)] flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]" aria-label={t.common.loading}>
      <div className="order-1 h-[42%] animate-pulse bg-sand-100 lg:order-2 lg:h-full" />
      <div className="order-2 space-y-4 p-5 lg:order-1">
        {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}
      </div>
    </div>
  );
}
