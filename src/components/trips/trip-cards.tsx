"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, Clock3, Gauge, Milestone, Trash2 } from "lucide-react";
import { deleteTrip } from "@/lib/actions/trips";
import type { TripListItem } from "@/lib/queries/trips";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { OdometerValue, RouteEnds, RouteLine } from "./route-motif";
import { t } from "@/i18n";

export function TripCards({ trips }: { trips: TripListItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="trip-list">
      {trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
    </ul>
  );
}

/** Planlanan yolculuk kartı: rota motifi, gösterge yazısıyla mesafe/süre ve eylemler. */
function TripCard({ trip }: { trip: TripListItem }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const res = await deleteTrip(trip.id);
      if (!res.ok) {
        setError(res.message ?? t.trips.deleteFailed);
        setConfirming(false);
      }
    });

  return (
    <li className="card group flex min-w-0 flex-col p-5 transition-colors hover:border-accent/40" data-testid="trip-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">{t.trips.date}: </span>
            {trip.plannedDate ? formatDate(trip.plannedDate) : t.trips.noDate}
          </p>
          <Link href={`/planla/${trip.id}`} className="mt-1 block text-lg leading-snug font-medium tracking-tight break-words text-fg hover:text-accent-ink">
            {trip.title}
          </Link>
        </div>
        <Badge tone="accent" className="shrink-0">{t.trips.status[trip.status] ?? trip.status}</Badge>
      </div>

      <div className="mt-5">
        {trip.origin && trip.destination ? (
          <RouteEnds from={trip.origin} to={trip.destination} />
        ) : (
          <RouteLine muted />
        )}
      </div>

      <dl className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-[0.65rem] font-semibold tracking-[0.16em] text-fg-subtle uppercase">
            <Gauge className="size-3 shrink-0" aria-hidden /> {t.maps.distance}
          </dt>
          <dd className="mt-1 text-2xl leading-none font-extralight tracking-[-0.03em] tabular-nums">
            {trip.distanceMeters !== null ? <OdometerValue value={formatDistance(trip.distanceMeters)} accent /> : <span className="text-base text-fg-muted">{t.trips.noRoute}</span>}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="flex items-center gap-1 text-[0.65rem] font-semibold tracking-[0.16em] text-fg-subtle uppercase">
            <Clock3 className="size-3 shrink-0" aria-hidden /> {t.maps.duration}
          </dt>
          <dd className="mt-1 text-2xl leading-none font-extralight tracking-[-0.03em] tabular-nums">
            {trip.durationSeconds !== null ? <OdometerValue value={formatDuration(trip.durationSeconds)} /> : <span className="text-base text-fg-muted">—</span>}
          </dd>
        </div>
        <div className="ml-auto min-w-0 text-right">
          <dt className="sr-only">Durak</dt>
          <dd className="inline-flex items-center gap-1 text-xs text-fg-muted">
            <Milestone className="size-3.5 shrink-0 text-fg-subtle" aria-hidden /> {t.trips.stops(trip.stopCount)}
          </dd>
        </div>
      </dl>

      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

      <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {confirming ? (
            <>
              <span className="mr-auto text-sm font-semibold text-fg">{t.trips.deleteConfirm}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>{t.common.cancel}</Button>
              <Button type="button" size="sm" variant="danger" onClick={remove} disabled={pending}>{t.trips.deleteYes}</Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" variant="ghost" className="mr-auto w-9 shrink-0 px-0 text-fg-muted hover:text-danger" onClick={() => setConfirming(true)}
                aria-label={`${t.trips.delete}: ${trip.title}`} title={t.trips.delete}>
                <Trash2 className="size-4 shrink-0" aria-hidden />
              </Button>
              <ButtonLink href={`/kayit-modu?yolculuk=${trip.id}`} size="sm" variant="secondary">{t.trips.startRecording}</ButtonLink>
              <ButtonLink href={`/planla/${trip.id}`} size="sm" variant="primary">{t.trips.edit}</ButtonLink>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
