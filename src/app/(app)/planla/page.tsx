import type { Metadata } from "next";
import { Suspense } from "react";
import { ExplorerLoader, ExplorerSkeleton } from "@/components/map/explorer-loader";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.trips.planTitle };

export default function NewTripPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<ExplorerSkeleton />}>
      <ExplorerLoader mode="plan" searchParams={searchParams} />
    </Suspense>
  );
}
