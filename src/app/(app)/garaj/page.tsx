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
    <div data-themed className="page-backdrop min-h-full">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
        <PageHeader eyebrow={t.garage.settings.title} index={1} title={t.garage.title} accent={t.garage.accent} description={t.garage.description} />
        <Suspense fallback={<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-[var(--radius-card)] bg-sunken" />)}</div>}>
          <GarageBody />
        </Suspense>
      </div>
    </div>
  );
}

async function GarageBody() {
  await requireUser();
  const vehicles = await listVehicles();
  return <GarageView vehicles={vehicles} />;
}
