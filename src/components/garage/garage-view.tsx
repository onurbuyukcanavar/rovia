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
        {full && <p className="text-sm text-stone-600">{G.limitNote(MAX)}</p>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {vehicles.length === 0 ? (
        <section className="card flex flex-col items-center gap-3 p-8 text-center" data-testid="garage-empty">
          <span className="grid size-14 place-items-center rounded-full bg-amber-100 text-amber-700"><CarFront className="size-7" aria-hidden /></span>
          <h2 className="text-lg font-bold">{G.empty.title}</h2>
          <p className="max-w-md text-sm leading-relaxed text-stone-600">{G.empty.body}</p>
        </section>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="vehicle-list">
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
            <p className="text-sm leading-relaxed text-stone-700">{G.confirmDelete.body(deleting.name)}</p>
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
    <li className="card flex flex-col gap-4 p-5" data-testid="vehicle-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
            <span className="truncate">{v.name}</span>
            {v.isDefault && <Badge className="bg-amber-100 text-amber-900">{G.defaultBadge}</Badge>}
          </h2>
          {subtitle && <p className="truncate text-sm text-stone-600">{subtitle}</p>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sand-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
          <Fuel className="size-3.5" aria-hidden /> {G.fuel[v.fuelType]}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Spec label={G.card.consumption} value={v.consumption === null ? G.card.unknown : `${formatAmount(v.consumption, 2)} ${G.units.per100(unit)}`} />
        <Spec label={unit === "kWh" ? G.card.battery : G.card.tank} value={v.tankCapacity === null ? G.card.unknown : `${formatAmount(v.tankCapacity)} ${G.units.capacity(unit)}`} />
        <Spec label={G.card.range} value={range === null ? G.card.unknown : `≈ ${formatAmount(range, 0)} km`} testId="vehicle-range" />
      </dl>
      {range !== null && <p className="flex items-start gap-1.5 text-xs text-stone-500"><Gauge className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {G.card.rangeNote}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={onEdit}><Pencil className="size-3.5" aria-hidden /> {G.edit}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDefault} disabled={pending}>
          <Star className="size-3.5" aria-hidden /> {v.isDefault ? G.unsetDefault : G.setDefault}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} className="text-danger"><Trash2 className="size-3.5" aria-hidden /> {G.remove}</Button>
      </div>
    </li>
  );
}

function Spec({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-2.5">
      <dt className="text-[0.65rem] font-semibold tracking-wide text-stone-500 uppercase">{label}</dt>
      <dd className="mt-0.5 font-bold tabular-nums" data-testid={testId}>{value}</dd>
    </div>
  );
}
