"use client";
import { useState, useTransition } from "react";
import { saveVehicle } from "@/lib/actions/vehicles";
import { formatDecimalTR, parseDecimalTR } from "@/lib/cost/parse";
import { energyUnit, FUEL_TYPES, isFuelType, type FuelType, type Vehicle } from "@/lib/cost/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { t } from "@/i18n";

const F = t.garage.form;
const E = t.garage.errors;

/** "" → null; geçersiz → undefined (hata) */
function num(s: string): number | null | undefined {
  if (!s.trim()) return null;
  const n = parseDecimalTR(s);
  return n === null || n <= 0 ? undefined : n;
}

export function VehicleForm({ vehicle, suggestDefault, onDone }: { vehicle: Vehicle | null; suggestDefault: boolean; onDone: () => void }) {
  const [fuelType, setFuelType] = useState<FuelType>(vehicle?.fuelType ?? "gasoline");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unit = energyUnit(fuelType);

  function submit(fd: FormData) {
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const consumption = num(s("consumption"));
    const tankCapacity = num(s("tankCapacity"));
    const yearText = s("modelYear");
    const modelYear = yearText ? Number(yearText) : null;
    const local: Record<string, string> = {};
    if (consumption === undefined || (consumption ?? 0) > 100) local.consumption = E.number;
    if (tankCapacity === undefined) local.tankCapacity = E.number;
    if (modelYear !== null && (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > 2100)) local.modelYear = E.year;
    if (!s("name") && !s("make") && !s("model")) local.name = E.nameRequired;
    setErrors(local);
    setMessage(null);
    if (Object.keys(local).length) return;

    startTransition(async () => {
      const r = await saveVehicle({
        id: vehicle?.id ?? null, name: s("name"), make: s("make"), model: s("model"), modelYear,
        fuelType, consumption: consumption ?? null, tankCapacity: tankCapacity ?? null,
        makeDefault: fd.get("makeDefault") === "on",
      });
      if (r.ok) onDone();
      else {
        setErrors(r.fieldErrors ?? {});
        setMessage(r.message);
      }
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="space-y-4" data-testid="vehicle-form" noValidate>
      {message && <Alert tone="error">{message}</Alert>}
      <Field label={F.name} name="name" defaultValue={vehicle?.name ?? ""} maxLength={80} hint={F.nameHint} error={errors.name} autoComplete="off" />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${F.make} (${F.optional})`} name="make" defaultValue={vehicle?.make ?? ""} maxLength={60} autoComplete="off" />
        <Field label={`${F.model} (${F.optional})`} name="model" defaultValue={vehicle?.model ?? ""} maxLength={60} autoComplete="off" />
        <Field label={F.year} name="modelYear" inputMode="numeric" defaultValue={vehicle?.modelYear ?? ""} error={errors.modelYear} autoComplete="off" />
        <div className="space-y-1.5">
          <label htmlFor="f-fuelType" className="block text-sm font-semibold text-ink-800">{F.fuelType}</label>
          <select id="f-fuelType" value={fuelType} onChange={(e) => isFuelType(e.target.value) && setFuelType(e.target.value)}
            className="h-12 w-full rounded-xl border border-sand-300 bg-white px-3 text-[0.95rem] outline-none focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25">
            {FUEL_TYPES.map((f) => <option key={f} value={f}>{t.garage.fuel[f]}</option>)}
          </select>
        </div>
        <Field label={`${F.consumption} (${t.garage.units.per100(unit)})`} name="consumption" inputMode="decimal" autoComplete="off"
          defaultValue={formatDecimalTR(vehicle?.consumption)} hint={F.consumptionHint} error={errors.consumption} />
        <Field label={`${F.tank} (${t.garage.units.capacity(unit)})`} name="tankCapacity" inputMode="decimal" autoComplete="off"
          defaultValue={formatDecimalTR(vehicle?.tankCapacity, 1)} hint={F.tankHint} error={errors.tankCapacity} />
      </div>
      {!vehicle?.isDefault && (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="makeDefault" defaultChecked={suggestDefault} className="size-4 accent-amber-500" /> {F.makeDefault}
        </label>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? t.common.saving : F.save}</Button>
      </div>
    </form>
  );
}
