"use client";
import { useState, useTransition } from "react";
import { CarFront, Fuel, Gauge, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { deleteVehicle, setDefaultVehicle } from "@/lib/actions/vehicles";
import { estimateRangeKm } from "@/lib/cost/estimate";
import { formatAmount } from "@/lib/cost/parse";
import { energyUnit, type Vehicle } from "@/lib/cost/types";
import { Modal } from "@/components/travelogue/workspace/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VehicleForm } from "./vehicle-form";
import { OdometerValue } from "@/components/trips/route-motif";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const G = t.garage;
const MAX = 20;

type Editing = { mode: "new" } | { mode: "edit"; vehicle: Vehicle } | null;

export function GarageView({ vehicles }: { vehicles: Vehicle[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Vehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message ?? t.common.unexpectedError);
      else after?.();
    });
  }

  const full = vehicles.length >= MAX;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="accent" onClick={() => setEditing({ mode: "new" })} disabled={full}>
          <Plus className="size-4" aria-hidden /> {G.add}
        </Button>
        {full && <p className="text-sm text-fg-muted">{G.limitNote(MAX)}</p>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {vehicles.length === 0 ? (
        <section className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-10 text-center" data-testid="garage-empty">
          <span className="grid size-14 place-items-center rounded-2xl border border-line bg-raised text-accent-ink"><CarFront className="size-7" aria-hidden /></span>
          <h2 className="mt-4 text-xl font-light tracking-tight text-fg">{G.empty.title}</h2>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">{G.empty.body}</p>
        </section>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="vehicle-list">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} v={v} pending={pending}
              onEdit={() => setEditing({ mode: "edit", vehicle: v })}
              onDelete={() => setDeleting(v)}
              onDefault={() => run(() => setDefaultVehicle(v.isDefault ? null : v.id))} />
          ))}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.mode === "edit" ? G.form.editTitle : G.form.addTitle} testId="vehicle-modal">
        {editing && (
          <VehicleForm key={editing.mode === "edit" ? editing.vehicle.id : "new"} vehicle={editing.mode === "edit" ? editing.vehicle : null}
            suggestDefault={vehicles.length === 0} onDone={() => setEditing(null)} />
        )}
      </Modal>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title={G.confirmDelete.title} testId="vehicle-delete-modal">
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-fg-muted">{G.confirmDelete.body(deleting.name)}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>{t.common.cancel}</Button>
              <Button type="button" variant="danger" disabled={pending}
                onClick={() => run(() => deleteVehicle(deleting.id), () => setDeleting(null))}>
                <Trash2 className="size-4" aria-hidden /> {G.confirmDelete.confirm}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function VehicleCard({ v, pending, onEdit, onDelete, onDefault }: {
  v: Vehicle; pending: boolean; onEdit: () => void; onDelete: () => void; onDefault: () => void;
}) {
  const unit = energyUnit(v.fuelType);
  const range = estimateRangeKm(v.tankCapacity, v.consumption);
  const subtitle = [v.make, v.model, v.modelYear].filter(Boolean).join(" · ");
  return (
    <li className={cn("card flex min-w-0 flex-col gap-5 p-5 sm:p-6", v.isDefault && "border-accent/40")} data-testid="vehicle-card">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-raised text-accent-ink">
          <CarFront className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-xl leading-tight font-light tracking-tight text-fg">
            <span className="min-w-0 break-words">{v.name}</span>
            {v.isDefault && <Badge tone="accent">{G.defaultBadge}</Badge>}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-sm text-fg-muted">{subtitle}</p>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-fg/[0.04] px-2.5 py-1 text-xs font-semibold text-fg-muted">
          <Fuel className="size-3.5 text-accent-ink" aria-hidden /> {G.fuel[v.fuelType]}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line min-[400px]:grid-cols-3">
        <Spec leadOnly label={G.card.consumption} value={v.consumption === null ? G.card.unknown : `${formatAmount(v.consumption, 2)} ${G.units.per100(unit)}`} />
        <Spec label={unit === "kWh" ? G.card.battery : G.card.tank} value={v.tankCapacity === null ? G.card.unknown : `${formatAmount(v.tankCapacity)} ${G.units.capacity(unit)}`} />
        <Spec label={G.card.range} value={range === null ? G.card.unknown : `≈ ${formatAmount(range, 0)} km`} testId="vehicle-range" accent={range !== null} />
      </dl>
      {range !== null && <p className="-mt-2 flex items-start gap-1.5 text-xs text-fg-subtle"><Gauge className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {G.card.rangeNote}</p>}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-4">
        <Button type="button" size="sm" variant="secondary" onClick={onEdit}><Pencil className="size-3.5" aria-hidden /> {G.edit}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDefault} disabled={pending}>
          <Star className={cn("size-3.5", v.isDefault && "fill-accent text-accent-ink")} aria-hidden /> {v.isDefault ? G.unsetDefault : G.setDefault}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} className="text-danger"><Trash2 className="size-3.5" aria-hidden /> {G.remove}</Button>
      </div>
    </li>
  );
}

/** Gösterge hücresi: küçük etiket, ince rakam, küçük birim. */
function Spec({ label, value, testId, accent, leadOnly }: { label: string; value: string; testId?: string; accent?: boolean; leadOnly?: boolean }) {
  return (
    <div className="min-w-0 bg-surface p-3">
      <div aria-hidden className="panel-gauge-ticks mb-2 h-1 w-full" />
      <dt className="text-[0.65rem] font-semibold tracking-[0.14em] break-words text-fg-subtle uppercase">{label}</dt>
      <dd className="mt-1 text-lg leading-tight font-extralight tracking-tight break-words tabular-nums" data-testid={testId}>
        <OdometerValue value={value} accent={accent} leadOnly={leadOnly} />
      </dd>
    </div>
  );
}
