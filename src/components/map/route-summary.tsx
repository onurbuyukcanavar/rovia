"use client";
import { Clock3, Landmark, Gauge, LoaderCircle, Ship, Ticket } from "lucide-react";
import type { RouteResult } from "@/lib/maps/types";
import { formatDistance, formatDuration } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { RouteFlags } from "./route-extras";
import { PlannerCost } from "@/components/cost/planner-cost";
import { GaugeValue, RoadMotif } from "./road-motif";
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
      <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.maps.computing}
      </p>
    );
  }
  if (!result) return null;

  const route = result.routes[selected] ?? result.routes[0];
  return (
    <section aria-label={t.maps.route} aria-busy={loading} className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
      <div className="card relative isolate grid grid-cols-2 overflow-hidden" data-testid="route-summary">
        <RoadMotif />
        <div className="min-w-0 p-4">
          <p className="eyebrow flex items-center gap-1.5"><Gauge className="size-3.5 text-accent-ink" aria-hidden /> {t.maps.distance}</p>
          <p className="mt-2 text-[1.85rem] leading-none font-extralight tracking-[-0.03em] break-words tabular-nums" data-testid="route-distance">
            <GaugeValue value={formatDistance(route.distanceMeters)} accent />
          </p>
        </div>
        <div className="min-w-0 border-l border-line p-4">
          <p className="eyebrow flex items-center gap-1.5"><Clock3 className="size-3.5 text-accent-ink" aria-hidden /> {t.maps.duration}</p>
          <p className="mt-2 text-[1.85rem] leading-none font-extralight tracking-[-0.03em] break-words tabular-nums" data-testid="route-duration">
            <GaugeValue value={formatDuration(route.durationSeconds)} />
          </p>
        </div>
      </div>
      {(route.hasToll || route.hasFerry) && (
        <div className="flex flex-wrap gap-2">
          {route.hasToll && <Badge className="gap-1"><Ticket className="size-3" aria-hidden /> {t.maps.hasToll}</Badge>}
          {route.hasFerry && <Badge className="gap-1"><Ship className="size-3" aria-hidden /> {t.maps.hasFerry}</Badge>}
        </div>
      )}
      {!!route.tollBridges?.length && (
        <p className="flex items-start gap-1.5 text-xs text-fg-muted" data-testid="bridge-note">
          <Landmark className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t.maps.bridgeNote(route.tollBridges.join(" ve "))}
        </p>
      )}

      <PlannerCost route={route} />

      {result.routes.length > 1 && (
        <div>
          <h3 className="eyebrow">{t.maps.alternatives}</h3>
          <ul className="mt-2 space-y-1.5">
            {result.routes.map((r, i) => (
              <li key={`${i}-${r.distanceMeters}`} data-testid="route-alternative">
                <button type="button" onClick={() => onSelect(i)} aria-pressed={i === selected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition",
                    i === selected ? "border-accent/60 bg-accent-soft font-semibold text-fg" : "border-line bg-raised text-fg-muted hover:border-line-strong hover:text-fg",
                  )}>
                  <span className="space-y-1">
                    <span className="block">{t.maps.routeN(i + 1)}</span>
                    <RouteFlags route={r} fastest={i === 0} />
                  </span>
                  <span className="shrink-0 text-fg-muted tabular-nums">{formatDistance(r.distanceMeters)} · {formatDuration(r.durationSeconds)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasWaypoints && <p className="text-xs text-fg-subtle">{t.maps.alternativesNote}</p>}
    </section>
  );
}
