"use client";
import { useState } from "react";
import { LoaderCircle, Wallet } from "lucide-react";
import type { RouteOption } from "@/lib/maps/types";
import type { FuelPrices, Vehicle } from "@/lib/cost/types";
import { detectRouteTolls } from "@/lib/cost/tolls";
import { loadCostContext } from "@/lib/actions/cost";
import { Alert } from "@/components/ui/alert";
import { TripCostCard } from "./trip-cost-card";
import { t } from "@/i18n";

const T = t.garage.cost;
type Ctx = { vehicles: Vehicle[]; fuelPrices: FuelPrices; error?: string };

/** Planlayıcıda seçili rotanın altında açılır "Tahmini maliyet" (kaydedilmez). Araçlar ilk açılışta yüklenir. */
export function PlannerCost({ route }: { route: RouteOption }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loading, setLoading] = useState(false);

  function onToggle(open: boolean) {
    if (!open || ctx || loading) return;
    setLoading(true);
    loadCostContext()
      .then((r) => setCtx(r.ok ? { vehicles: r.vehicles, fuelPrices: r.fuelPrices } : { vehicles: [], fuelPrices: {}, error: r.message }))
      .catch(() => setCtx({ vehicles: [], fuelPrices: {}, error: T.loadError }))
      .finally(() => setLoading(false));
  }

  const tolls = detectRouteTolls(route);
  const routeKey = `${route.distanceMeters}:${route.encodedPolyline.length}:${tolls.map((x) => x.id).join(",")}`;

  return (
    <details className="group card overflow-hidden" data-testid="planner-cost"
      onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-fg hover:bg-fg/[0.04]">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5"><span className="flex items-center gap-2"><Wallet className="size-4 shrink-0 text-accent-ink" aria-hidden /> {T.plannerTitle}</span>
          <span className="font-normal text-fg-subtle">· {T.plannerHint}</span></span>
        <span className="text-fg-subtle transition group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="border-t border-line p-4">
        {loading || !ctx ? (
          <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> {T.loading}
          </p>
        ) : (
          <div className="space-y-3">
            {ctx.error && <Alert>{ctx.error}</Alert>}
            <TripCostCard key={routeKey} compact distanceM={route.distanceMeters} distanceSource="route"
              vehicles={ctx.vehicles} fuelPrices={ctx.fuelPrices} tolls={tolls} />
          </div>
        )}
      </div>
    </details>
  );
}
