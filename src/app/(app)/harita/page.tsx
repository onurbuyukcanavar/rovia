import type { Metadata } from "next";
import { Suspense } from "react";
import { ExplorerLoader, ExplorerSkeleton } from "@/components/map/explorer-loader";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.maps.title };

export default function MapPage() {
  return (
    <Suspense fallback={<ExplorerSkeleton />}>
      <ExplorerLoader mode="explore" />
    </Suspense>
  );
}
