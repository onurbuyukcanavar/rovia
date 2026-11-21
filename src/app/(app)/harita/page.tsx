import type { Metadata } from "next";
import { Suspense } from "react";
import { ExplorerLoader, ExplorerSkeleton } from "@/components/map/explorer-loader";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.maps.title };

/** /harita?ad=…&konum=lat,lng: paylaşılan konumdan "Haritada göster" (nokta varış olarak işaretlenir). */
export default function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense fallback={<ExplorerSkeleton />}>
      <ExplorerLoader mode="explore" searchParams={searchParams} />
    </Suspense>
  );
}
