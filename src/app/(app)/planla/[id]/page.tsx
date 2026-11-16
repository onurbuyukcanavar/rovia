import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { MapExplorer } from "@/components/map/map-explorer";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { getTripForEdit } from "@/lib/queries/trips";
import { listFavoriteStops } from "@/lib/queries/favorites";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.trips.editTitle };

export default function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PlannerSkeleton />}>
      <TripPlanner params={params} />
    </Suspense>
  );
}

async function TripPlanner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const [trip, favorites] = await Promise.all([getTripForEdit(id), listFavoriteStops()]);
  if (!trip) notFound();

  // Başlamış yolculuk kayıt ekranında, tamamlanmış yolculuk özet sayfasında
  if (trip.status === "active") redirect("/kayit-modu");
  if (trip.status === "completed") redirect(`/yolculuklar/${trip.id}`);
  if (trip.status !== "planned") {
    return (
      <div className="mx-auto max-w-xl space-y-4 px-4 py-10">
        <h1 className="text-2xl font-extrabold tracking-tight">{trip.title}</h1>
        <Alert>{t.trips.errors.notEditable}</Alert>
        <ButtonLink href="/yolculuklar" variant="secondary">{t.trips.backToList}</ButtonLink>
      </div>
    );
  }
  return <MapExplorer key={trip.id} styleUrl={mapStyleUrl()} mode="plan" trip={trip} favorites={favorites} />;
}

function PlannerSkeleton() {
  return (
    <div className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[26rem_1fr]" aria-label={t.common.loading}>
      <div className="order-1 h-[42%] animate-pulse bg-sand-100 lg:order-2 lg:h-full" />
      <div className="order-2 space-y-4 p-5 lg:order-1">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-sand-100" />)}
      </div>
    </div>
  );
}
