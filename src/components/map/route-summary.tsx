"use client";
import { Clock3, Gauge, LoaderCircle, Ship, Ticket } from "lucide-react";
import type { RouteResult } from "@/lib/maps/types";
import { formatDistance, formatDuration } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { RouteFlags } from "./route-extras";
import { t } from "@/i18n";

type Props = {
  result: RouteResult | null;
  selected: number;
  onSelect: (i: number) => void;
  loading: boolean;
  error: string | null;
  hasWaypoints: boolean;
};

export function RouteSummary({ result, selected, onSelect, loading, error, hasWaypoints }: Props) {
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!result && loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-stone-600" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.maps.computing}
      </p>
    );
  }
  if (!result) return null;

  const route = result.routes[selected] ?? result.routes[0];
  return (
    <section aria-label={t.maps.route} aria-busy={loading} className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sand-200 bg-sand-200" data-testid="route-summary">
        <div className="bg-ink-900 p-4 text-paper">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-paper/60"><Gauge className="size-3.5" aria-hidden /> {t.maps.distance}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" data-testid="route-distance">{formatDistance(route.distanceMeters)}</p>
        </div>
        <div className="bg-ink-900 p-4 text-paper">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-paper/60"><Clock3 className="size-3.5" aria-hidden /> {t.maps.duration}</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums" data-testid="route-duration">{formatDuration(route.durationSeconds)}</p>
        </div>
      </div>
      {(route.hasToll || route.hasFerry) && (
        <div className="flex flex-wrap gap-2">
          {route.hasToll && <Badge className="gap-1"><Ticket className="size-3" aria-hidden /> {t.maps.hasToll}</Badge>}
          {route.hasFerry && <Badge className="gap-1"><Ship className="size-3" aria-hidden /> {t.maps.hasFerry}</Badge>}
        </div>
      )}

      {result.routes.length > 1 && (
        <div>
          <h3 className="eyebrow">{t.maps.alternatives}</h3>
          <ul className="mt-2 space-y-1.5">
            {result.routes.map((r, i) => (
              <li key={`${i}-${r.distanceMeters}`} data-testid="route-alternative">
                <button type="button" onClick={() => onSelect(i)} aria-pressed={i === selected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    i === selected ? "border-ink-900 bg-ink-900/5 font-semibold" : "border-sand-200 hover:border-stone-500",
                  )}>
                  <span className="space-y-1">
                    <span className="block">{t.maps.routeN(i + 1)}</span>
                    <RouteFlags route={r} fastest={i === 0} />
                  </span>
                  <span className="shrink-0 tabular-nums text-stone-700">{formatDistance(r.distanceMeters)} · {formatDuration(r.durationSeconds)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasWaypoints && <p className="text-xs text-stone-600">{t.maps.alternativesNote}</p>}
    </section>
  );
}
