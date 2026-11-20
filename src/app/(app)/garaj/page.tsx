import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { GarageView } from "@/components/garage/garage-view";
import { requireUser } from "@/lib/dal";
import { listVehicles } from "@/lib/queries/vehicles";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.garage.title };

export default function GaragePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t.nav.garage} title={t.garage.title} description={t.garage.description} />
      <Suspense fallback={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-sand-100" />)}</div>}>
        <GarageBody />
      </Suspense>
    </div>
  );
}

async function GarageBody() {
  await requireUser();
  const vehicles = await listVehicles();
  return <GarageView vehicles={vehicles} />;
}
