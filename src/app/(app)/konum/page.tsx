import type { Metadata } from "next";
import { Suspense } from "react";
import { SharedLocationView } from "@/components/shared-location/shared-location-view";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { sharedInputFromParams } from "@/lib/shared-location/params";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.sharedLocation.title };

type Params = Record<string, string | string[] | undefined>;

/**
 * Paylaşılan konum: /konum?text=… · ?url=… · ?q=… · ?lat=&lng=&label=
 * Web Share Target (manifest share_target) ve Android uygulaması (geo:, SEND) buraya yönlendirir.
 * Oturum yoksa proxy giriş sayfasına ?next=/konum?… ile yönlendirir; girişten sonra buraya dönülür.
 */
export default function SharedLocationPage({ searchParams }: { searchParams: Promise<Params> }) {
  return (
    <Suspense fallback={<SharedLocationSkeleton />}>
      <SharedLocationLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function SharedLocationLoader({ searchParams }: { searchParams: Promise<Params> }) {
  const [, params] = await Promise.all([requireUser(), searchParams]);
  const { text, label } = sharedInputFromParams(params);
  return <SharedLocationView key={`${text}\u0000${label ?? ""}`} styleUrl={mapStyleUrl()} input={text} labelHint={label} />;
}

function SharedLocationSkeleton() {
  return (
    <div data-themed className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]" aria-label={t.common.loading}>
      <div className="order-1 h-[42%] animate-pulse bg-sunken lg:order-2 lg:h-full" />
      <div className="order-2 space-y-4 border-t border-line p-5 lg:order-1 lg:border-t-0 lg:border-r">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sunken" />)}
      </div>
    </div>
  );
}
