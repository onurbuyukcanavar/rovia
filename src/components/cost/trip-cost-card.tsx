"use client";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { ExternalLink, Plus, TriangleAlert, X } from "lucide-react";
import { estimateTripCost } from "@/lib/cost/estimate";
import { formatAmount, formatDecimalTR, formatTL, parseDecimalTR } from "@/lib/cost/parse";
import { daysSince, TARIFF_DATE, TARIFF_SOURCE, TARIFF_SOURCE_URL } from "@/lib/cost/tariffs";
import {
  energyUnit, FUEL_TYPES, isFuelType, LIMITS, type CostAssumptions, type FuelPrices, type FuelType, type TollItem, type Vehicle,
} from "@/lib/cost/types";
import { rememberFuelPrice, saveTripCost } from "@/lib/actions/cost";
import { formatDate, formatDistance } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.garage.cost;
const EPDK_URL = "https://www.epdk.gov.tr/Detay/Icerik/3-0-0/akaryakit-fiyatlari";
const MANUAL = "manual";
const OLD_TARIFF_DAYS = 180;

type Row = Omit<TollItem, "amount"> & { amountText: string };
type Form = {
  vehicleId: string;
  fuelType: FuelType;
  consumption: string;
  price: string;
  /** Fiyat kayıtlı bir değerden geldiyse tarihi; kullanıcı değiştirince null */
  priceDate: string | null;
  people: string;
  rows: Row[];
};

export type TripCostCardProps = {
  distanceM: number | null;
  distanceSource: "recorded" | "planned" | "route";
  vehicles: Vehicle[];
  fuelPrices: FuelPrices;
  tolls: TollItem[];
  initial?: CostAssumptions | null;
  /** Verilirse varsayımlar bu yolculuğa kaydedilir */
  tripId?: string;
  compact?: boolean;
};

const toRow = (i: TollItem): Row => ({ ...i, amountText: formatDecimalTR(i.amount) });

function initForm({ vehicles, fuelPrices, tolls, initial }: TripCostCardProps): Form {
  const savedVehicle = initial?.vehicleId ? vehicles.find((v) => v.id === initial.vehicleId) : undefined;
  const vehicle = initial ? savedVehicle : vehicles.find((v) => v.isDefault);
  const fuelType = initial?.fuelType ?? vehicle?.fuelType ?? "gasoline";
  const stored = fuelPrices[fuelType];
  const price = initial?.fuelPrice ?? stored?.price ?? null;
  const priceDate = initial?.fuelPrice ? initial.priceDate : stored ? stored.date : null;
  return {
    vehicleId: vehicle?.id ?? MANUAL,
    fuelType,
    consumption: formatDecimalTR(initial ? initial.consumption : vehicle?.consumption),
    price: formatDecimalTR(price),
    priceDate,
    people: String(initial?.people ?? 1),
    rows: initial
      ? initial.tolls.map((x, i) => toRow({ ...x, id: `s:${i}` }))
      : tolls.map(toRow),
  };
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

function toAssumptions(f: Form): CostAssumptions {
  const people = Math.min(LIMITS.peopleMax, Math.max(1, Math.floor(Number(f.people) || 1)));
  const consumption = parseDecimalTR(f.consumption);
  const price = parseDecimalTR(f.price);
  return {
    v: 1,
    vehicleId: f.vehicleId === MANUAL ? null : f.vehicleId,
    fuelType: f.fuelType,
    consumption: consumption !== null && consumption > 0 && consumption <= LIMITS.consumptionMax ? consumption : null,
    fuelPrice: price !== null && price > 0 && price <= LIMITS.priceMax ? price : null,
    priceDate: price ? (f.priceDate ?? today()) : null,
    people,
    tolls: f.rows.slice(0, 30).map((r) => {
      const a = parseDecimalTR(r.amountText);
      return {
        label: (r.label.trim() || T.customLabel).slice(0, 120),
        amount: a !== null && a >= 0 && a <= LIMITS.tollMax ? a : null,
        source: r.source, kind: r.kind,
        ...(r.note ? { note: r.note.slice(0, 200) } : {}),
        ...(r.km !== undefined ? { km: r.km } : {}),
      };
    }),
  };
}

/** Yaklaşık yolculuk maliyeti: tüm değerler kullanıcının değiştirebildiği varsayımlardır. */
export function TripCostCard(props: TripCostCardProps) {
  const { distanceM, distanceSource, vehicles, fuelPrices, tripId, compact = false } = props;
  const [form, setForm] = useState<Form>(() => initForm(props));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = useId();

  function persist(next: Form) {
    const a = toAssumptions(next);
    if (tripId) {
      setStatus("saving");
      saveTripCost(tripId, a)
        .then((r) => setStatus(r.ok ? "saved" : "error"))
        .catch(() => setStatus("error"));
    } else if (a.fuelPrice !== null && fuelPrices[a.fuelType]?.price !== a.fuelPrice) {
      rememberFuelPrice({ fuelType: a.fuelType, price: a.fuelPrice }).catch(() => {});
    }
  }

  function change(patch: Partial<Form>) {
    const next = { ...form, ...patch };
    setForm(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 1200);
  }

  function priceFor(fuelType: FuelType): Pick<Form, "price" | "priceDate"> {
    const s = fuelPrices[fuelType];
    return { price: formatDecimalTR(s?.price), priceDate: s?.date ?? null };
  }

  function chooseVehicle(id: string) {
    const v = vehicles.find((x) => x.id === id);
    if (!v) return change({ vehicleId: MANUAL });
    change({
      vehicleId: v.id,
      fuelType: v.fuelType,
      consumption: v.consumption !== null ? formatDecimalTR(v.consumption) : form.consumption,
      ...(v.fuelType !== form.fuelType ? priceFor(v.fuelType) : {}),
    });
  }

  function chooseFuel(value: string) {
    if (!isFuelType(value) || value === form.fuelType) return;
    change({ fuelType: value, ...priceFor(value) });
  }

  function updateRow(id: string, patch: Partial<Row>) {
    change({ rows: form.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }

  const unit = energyUnit(form.fuelType);
  const result = estimateTripCost({
    distanceM,
    consumptionPer100: parseDecimalTR(form.consumption),
    fuelType: form.fuelType,
    fuelPrice: parseDecimalTR(form.price),
    tollItems: form.rows.map((r) => ({ label: r.label, amount: parseDecimalTR(r.amountText) })),
    people: Number(form.people) || 1,
  });
  const hasReference = form.rows.some((r) => r.kind === "crossing" && r.source === "reference");
  const tariffAge = hasReference ? daysSince(TARIFF_DATE) : 0;
  const sourceLabel = distanceSource === "recorded" ? T.distanceRecorded : distanceSource === "planned" ? T.distancePlanned : T.distanceRoute;
  const id = (k: string) => `${uid}-${k}`;

  return (
    <div className="space-y-4" data-testid="trip-cost">
      {distanceM ? (
        <p className="text-sm text-fg-muted">
          {T.distance}: <span className="font-semibold text-fg tabular-nums">{formatDistance(distanceM)}</span> ({sourceLabel})
        </p>
      ) : (
        <p className="text-sm text-fg-muted">{T.missing.distance}</p>
      )}

      <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <label htmlFor={id("veh")} className="block text-xs font-semibold text-fg">{T.vehicle}</label>
          <select id={id("veh")} value={form.vehicleId} onChange={(e) => chooseVehicle(e.target.value)} className={inputCls}>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            <option value={MANUAL}>{T.manual}</option>
          </select>
          <Link href="/garaj" className="text-xs font-semibold text-fg-muted underline-offset-2 hover:underline">{T.garageLink}</Link>
        </div>
        <div className="space-y-1">
          <label htmlFor={id("fuel")} className="block text-xs font-semibold text-fg">{T.fuelType}</label>
          <select id={id("fuel")} value={form.fuelType} onChange={(e) => chooseFuel(e.target.value)} className={inputCls}>
            {FUEL_TYPES.map((f) => <option key={f} value={f}>{t.garage.fuel[f]}</option>)}
          </select>
        </div>
        <NumField id={id("cons")} label={T.consumption} unit={t.garage.units.per100(unit)} value={form.consumption}
          onChange={(v) => change({ consumption: v })} placeholder={unit === "kWh" ? "16" : "6,4"} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <NumField id={id("price")} label={form.fuelType === "electric" ? T.electricPrice : T.fuelPrice} unit={T.priceUnit(unit)}
            value={form.price} onChange={(v) => change({ price: v, priceDate: null })} />
          {form.price && form.priceDate ? (
            <p className="text-xs text-fg-muted" data-testid="price-origin">{T.priceSaved(formatDate(form.priceDate))}</p>
          ) : !form.price ? (
            <p className="text-xs text-fg-muted">
              {form.fuelType === "electric" ? T.priceHintElectric : (
                <>
                  {T.priceHint}{" "}
                  <a href={EPDK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2">
                    {T.epdk} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </>
              )}
            </p>
          ) : null}
        </div>
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <label htmlFor={id("people")} className="block text-xs font-semibold text-fg">{T.people}</label>
          <input id={id("people")} type="number" min={1} max={LIMITS.peopleMax} inputMode="numeric" value={form.people}
            onChange={(e) => change({ people: e.target.value })} className={cn(inputBase, "h-10 w-24")} />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-fg">{T.tolls}</legend>
        {form.rows.length === 0 && <p className="text-xs text-fg-muted">{T.noTolls}</p>}
        <ul className="space-y-2" data-testid="cost-tolls">
          {form.rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-raised p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  {r.kind === "custom" ? (
                    <input aria-label={T.tollLabel} value={r.label} placeholder={T.customLabel} maxLength={120}
                      onChange={(e) => updateRow(r.id, { label: e.target.value })} className={cn(inputBase, "h-9 w-full")} />
                  ) : (
                    <p className="text-sm font-semibold text-fg">{r.label}</p>
                  )}
                  {r.kind === "crossing" && (
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                      r.source === "reference" ? "bg-accent-soft text-accent-ink" : "bg-fg/[0.07] text-fg-muted")}>
                      {r.source === "reference" ? T.referenceTag : T.userTag}
                    </span>
                  )}
                  {r.note && <p className="text-xs text-fg-subtle">{r.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <input aria-label={`${r.label || T.customLabel} — ${T.tollAmount}`} inputMode="decimal" value={r.amountText}
                    placeholder={T.tollAmountMissing} onChange={(e) => updateRow(r.id, { amountText: e.target.value, source: "user" })}
                    className={cn(inputBase, "h-9 w-24 text-right tabular-nums")} />
                  <span className="text-xs text-fg-subtle">TL</span>
                  <button type="button" aria-label={`${T.removeToll}: ${r.label || T.customLabel}`}
                    onClick={() => change({ rows: form.rows.filter((x) => x.id !== r.id) })}
                    className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-fg/[0.07] hover:text-fg">
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" disabled={form.rows.length >= 30}
          onClick={() => change({ rows: [...form.rows, { id: `c:${Date.now()}`, label: "", amountText: "", source: "user", kind: "custom" }] })}
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent-ink hover:underline disabled:opacity-50">
          <Plus className="size-4" aria-hidden /> {T.addToll}
        </button>
        {hasReference && (
          <p className="text-xs text-fg-subtle">
            {T.tariffSource}:{" "}
            <a href={TARIFF_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{TARIFF_SOURCE}</a>
          </p>
        )}
        {tariffAge > OLD_TARIFF_DAYS && (
          <p className="flex items-start gap-1.5 text-xs text-accent-ink" role="status">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {T.tariffOld(tariffAge)}
          </p>
        )}
      </fieldset>

      <section aria-label={T.result} className="space-y-1.5 rounded-2xl border border-accent/35 bg-accent-soft p-4 text-fg" data-testid="cost-result">
        <Line label={unit === "kWh" ? T.energyLine : T.fuelLine} testId="cost-fuel"
          value={result.energy === null ? "—" : `~${formatAmount(result.energy)} ${unit}${result.fuelCost !== null ? ` ≈ ${formatTL(result.fuelCost)}` : ""}`} />
        <Line label={T.tollLine} testId="cost-tolls-total"
          value={`${formatTL(result.tollTotal)}${result.unknownTolls ? ` (${T.unknownTolls(result.unknownTolls)})` : ""}`} />
        <div className="border-t border-line-strong pt-1.5">
          <Line label={T.total} strong testId="cost-total" value={result.total === null ? "—" : `≈ ${formatTL(result.total)}${result.partial ? " +" : ""}`} />
          {result.people > 1 && result.perPerson !== null && (
            <Line label={T.perPerson} testId="cost-per-person" value={`≈ ${formatTL(result.perPerson)}`} />
          )}
        </div>
        {result.missing.filter((m) => m !== "distance").map((m) => (
          <p key={m} className="text-xs text-accent-ink">{T.missing[m]}</p>
        ))}
      </section>
      <p className="text-xs text-fg-muted" data-testid="cost-disclaimer">{T.disclaimer}</p>
      {tripId ? (
        status !== "idle" && (
          <p className={cn("text-xs", status === "error" ? "text-danger" : "text-fg-subtle")} role="status">
            {status === "saving" ? T.saving : status === "saved" ? T.saved : T.saveError}
          </p>
        )
      ) : (
        <p className="text-xs text-fg-subtle">{T.notPersisted}</p>
      )}
    </div>
  );
}

// Temalı form alanı (inputClass yazı boyutu 0.95rem; maliyet kartında biraz daha sıkı).
// Boyut sınıfları ayrı: tailwind-merge yok, "w-full" + "w-24" birlikte yazılırsa hangisinin kazanacağı belirsiz.
const inputBase = "min-w-0 rounded-xl border border-line-strong bg-field px-3 text-sm text-fg outline-none transition placeholder:text-fg-subtle focus:border-accent focus:ring-4 focus:ring-accent/20";
const inputCls = `${inputBase} h-10 w-full`;

function NumField({ id, label, unit, value, onChange, placeholder }: {
  id: string; label: string; unit: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-semibold text-fg">{label}</label>
      <div className="flex items-center gap-1.5">
        <input id={id} inputMode="decimal" autoComplete="off" value={value} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)} className={cn(inputCls, "tabular-nums")} />
        <span className="shrink-0 text-xs text-fg-subtle">{unit}</span>
      </div>
    </div>
  );
}

function Line({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId: string }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-fg-muted">{label}</span>
      <span className={cn("text-right tabular-nums", strong ? "text-lg font-extrabold" : "font-semibold")} data-testid={testId}>{value}</span>
    </p>
  );
}
