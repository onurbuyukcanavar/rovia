"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, CalendarDays, Clock3, Gauge, MapPin, Trash2 } from "lucide-react";
import { deleteTrip } from "@/lib/actions/trips";
import type { TripListItem } from "@/lib/queries/trips";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDistance, formatDuration } from "@/lib/format";
import { t } from "@/i18n";

export function TripCards({ trips }: { trips: TripListItem[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="trip-list">
      {trips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
    </ul>
  );
}

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
    <li className="card flex flex-col p-5" data-testid="trip-card">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/planla/${trip.id}`} className="min-w-0 text-lg leading-snug font-bold hover:underline">
          {trip.title}
        </Link>
        <Badge>{t.trips.status[trip.status] ?? trip.status}</Badge>
      </div>

      {trip.origin && trip.destination && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-stone-700">
          <MapPin className="size-4 shrink-0 text-amber-600" aria-hidden />
          <span className="truncate">{trip.origin}</span>
          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{trip.destination}</span>
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-stone-600">
        <div className="col-span-2 flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden />
          <dt className="sr-only">{t.trips.date}</dt>
          <dd>{trip.plannedDate ? formatDate(trip.plannedDate) : t.trips.noDate}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Gauge className="size-4" aria-hidden />
          <dt className="sr-only">{t.maps.distance}</dt>
          <dd className="tabular-nums">{trip.distanceMeters !== null ? formatDistance(trip.distanceMeters) : t.trips.noRoute}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock3 className="size-4" aria-hidden />
          <dt className="sr-only">{t.maps.duration}</dt>
          <dd className="tabular-nums">{trip.durationSeconds !== null ? formatDuration(trip.durationSeconds) : "—"}</dd>
        </div>
        <div className="col-span-2 text-xs">
          <dt className="sr-only">Durak</dt>
          <dd>{t.trips.stops(trip.stopCount)}</dd>
        </div>
      </dl>

      {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-sand-200 pt-4">
        {confirming ? (
          <>
            <span className="mr-auto text-sm font-semibold">{t.trips.deleteConfirm}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>{t.common.cancel}</Button>
            <Button type="button" size="sm" variant="danger" onClick={remove} disabled={pending}>{t.trips.deleteYes}</Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} aria-label={`${t.trips.delete}: ${trip.title}`}>
              <Trash2 className="size-4" aria-hidden /> {t.trips.delete}
            </Button>
            <Link href={`/kayit-modu?yolculuk=${trip.id}`} className="inline-flex h-9 items-center rounded-full border border-sand-300 px-4 text-sm font-semibold hover:bg-sand-100">
              {t.trips.startRecording}
            </Link>
            <Link href={`/planla/${trip.id}`} className="inline-flex h-9 items-center rounded-full bg-ink-900 px-4 text-sm font-semibold text-paper hover:bg-ink-800">
              {t.trips.edit}
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
