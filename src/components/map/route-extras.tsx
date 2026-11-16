"use client";
import {
  ArrowLeft, ArrowRight, ArrowUp, CornerUpLeft, Flag, Info, Landmark, LoaderCircle, MapPin, Merge, Mountain, Plus,
  RotateCw, Ship, Sparkles, Ticket, TrafficCone, X,
} from "lucide-react";
import { useState } from "react";
import { decodePolyline, insertionIndexForLegs, projectOntoPolyline, type LatLng } from "@/lib/geo";
import { MAX_WAYPOINTS } from "@/lib/maps/explorer-state";
import type { FoundPlace, RouteOption, RouteOptions, RouteStep, Stop, StepKind } from "@/lib/maps/types";
import { formatDistance } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

// ---------------------------------------------------------------------------- Rota seçenekleri
const OPTION_KEYS = ["avoidTolls", "avoidHighways", "avoidFerries"] as const;
const OPTION_ICON = { avoidTolls: Ticket, avoidHighways: TrafficCone, avoidFerries: Ship } as const;

/** Google Maps'teki rota seçenekleri: ücretli yollardan, otoyollardan, feribotlardan kaçın. */
export function RouteOptionsBar({ options, onChange }: { options: RouteOptions; onChange: (o: Partial<RouteOptions>) => void }) {
  return (
    <fieldset className="space-y-2" data-testid="route-options">
      <legend className="eyebrow mb-2">{t.maps.options.title}</legend>
      <div className="flex flex-wrap gap-1.5">
        {OPTION_KEYS.map((k) => {
          const Icon = OPTION_ICON[k];
          const on = options[k];
          return (
            <label key={k} className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition select-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-amber-400/25",
              on ? "border-ink-900 bg-ink-900 text-paper" : "border-sand-300 bg-paper-50 text-ink-900 hover:border-stone-500",
            )}>
              <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange({ [k]: e.target.checked })} />
              <Icon className={cn("size-4", on && "text-amber-400")} aria-hidden />
              {t.maps.options[k]}
            </label>
          );
        })}
      </div>
      {options.avoidTolls && !options.avoidFerries && <p className="text-xs text-stone-600">{t.maps.options.tollNote}</p>}
    </fieldset>
  );
}

/** Alternatif rota satırındaki kısa özellik rozetleri. */
export function RouteFlags({ route, fastest }: { route: RouteOption; fastest?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {fastest && <Flagish className="bg-success/10 text-success">{t.maps.fastest}</Flagish>}
      {route.hasToll && <Flagish><Ticket className="size-3" aria-hidden /> {t.maps.tollShort}</Flagish>}
      {route.hasFerry && <Flagish className="bg-sky-100 text-sky-800"><Ship className="size-3" aria-hidden /> {t.maps.ferryShort}</Flagish>}
      {!route.hasHighway && <Flagish>{t.maps.noHighway}</Flagish>}
    </span>
  );
}

function Flagish({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-sand-100 px-2 py-0.5 text-[0.68rem] font-semibold text-stone-700", className)}>{children}</span>;
}

// ---------------------------------------------------------------------------- Yol tarifi
const STEP_ICON: Record<StepKind, typeof ArrowUp> = {
  depart: MapPin, arrive: Flag, left: ArrowLeft, right: ArrowRight, straight: ArrowUp, uturn: CornerUpLeft,
  roundabout: RotateCw, ferry: Ship, merge: Merge, ramp: ArrowUp,
};

export function RouteDirections({ steps, onFocus }: { steps: RouteStep[]; onFocus: (p: LatLng) => void }) {
  if (!steps.length) return null;
  return (
    <details className="group rounded-2xl border border-sand-200 bg-paper-50" data-testid="route-directions">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-semibold">
        {t.maps.directions.title(steps.length)}
        <span className="text-stone-500 transition group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <ol className="max-h-80 divide-y divide-sand-100 overflow-y-auto border-t border-sand-200">
        {steps.map((s, i) => {
          const Icon = STEP_ICON[s.kind] ?? ArrowUp;
          return (
            <li key={i}>
              <button type="button" onClick={() => onFocus(s.location)} title={t.maps.directions.showOnMap}
                className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm hover:bg-white", s.kind === "ferry" && "bg-sky-50")}>
                <Icon className={cn("mt-0.5 size-4 shrink-0", s.kind === "ferry" ? "text-sky-700" : "text-stone-600")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block first-letter:uppercase">{s.instruction}</span>
                  {s.toll && <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><Ticket className="size-3" aria-hidden /> {t.maps.directions.tollStep}</span>}
                </span>
                {s.distanceMeters > 0 && <span className="shrink-0 text-xs text-stone-500 tabular-nums">{formatDistance(s.distanceMeters)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {steps.length >= 400 && <p className="px-4 py-2 text-xs text-stone-500">{t.maps.directions.truncated}</p>}
    </details>
  );
}

// ---------------------------------------------------------------------------- Rota üzerindeki öneriler
/** Yerin rota boyunca hangi bacağa (ara durak sırası) ekleneceği. */
export function insertionIndexFor(location: LatLng, route: RouteOption): number {
  const path = decodePolyline(route.encodedPolyline);
  const proj = projectOntoPolyline(location, path);
  const legs = route.legs.map((l) => l.distanceMeters);
  return legs.length ? insertionIndexForLegs(proj.alongDistance, legs) : 0;
}

export const placeToStop = (p: FoundPlace): Stop => ({ id: p.id, label: p.name, address: p.address, ref: p.id, location: p.location });

type SuggestionsProps = {
  route: RouteOption;
  places: FoundPlace[];
  loading: boolean;
  error: string | null;
  hidden: boolean;
  onHidden: (hidden: boolean) => void;
  waypointCount: number;
  onAdd: (stop: Stop, index: number) => void;
  onDetails: (p: FoundPlace) => void;
};

export function RouteSuggestions({ route, places, loading, error, hidden, onHidden: setHidden, waypointCount, onAdd, onDetails }: SuggestionsProps) {
  const [added, setAdded] = useState<string | null>(null);
  if (hidden) {
    return (
      <button type="button" onClick={() => setHidden(false)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline">
        <Sparkles className="size-4" aria-hidden /> {t.maps.suggestions.show}
      </button>
    );
  }
  const full = waypointCount >= MAX_WAYPOINTS;
  return (
    <section className="space-y-3 rounded-2xl border border-amber-400/50 bg-amber-50/40 p-4" aria-labelledby="sug-title" data-testid="route-suggestions">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="sug-title" className="flex items-center gap-1.5 text-sm font-bold"><Sparkles className="size-4 text-amber-600" aria-hidden /> {t.maps.suggestions.title}</h3>
          <p className="text-xs text-stone-600">{t.maps.suggestions.subtitle}</p>
        </div>
        <button type="button" onClick={() => setHidden(true)} aria-label={t.maps.suggestions.hide} title={t.maps.suggestions.hide}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-sand-100"><X className="size-4" aria-hidden /></button>
      </div>
      {loading && places.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-stone-600" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.maps.suggestions.loading}</p>
      )}
      {error && <p className="flex items-center gap-1.5 text-sm text-stone-600"><Info className="size-4" aria-hidden /> {error}</p>}
      {!loading && !error && places.length === 0 && <p className="text-sm text-stone-600">{t.maps.suggestions.empty}</p>}
      {added && <p className="text-sm font-semibold text-success" role="status">{added}</p>}
      {places.length > 0 && (
        <ul className="space-y-2">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-sand-200 bg-white p-2.5" data-testid="suggestion">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500 text-ink-950" aria-hidden>
                {p.category === "nature" ? <Mountain className="size-4" /> : <Landmark className="size-4" />}
              </span>
              <button type="button" onClick={() => onDetails(p)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-stone-600">
                  {[p.typeLabel, p.address].filter(Boolean).join(" · ")}
                </span>
                {p.alongRoute !== null && (
                  <span className="block text-xs text-stone-500 tabular-nums">
                    {t.maps.suggestions.at(String(Math.max(1, Math.round(p.alongRoute / 1000))), formatDistance(p.distanceFromRoute))}
                  </span>
                )}
              </button>
              <Button type="button" size="sm" variant="secondary" disabled={full} title={full ? t.maps.suggestions.full : undefined}
                aria-label={`${p.name}: ${t.maps.suggestions.add}`}
                onClick={() => {
                  onAdd(placeToStop(p), insertionIndexFor(p.location, route));
                  setAdded(t.maps.suggestions.added(p.name));
                }}>
                <Plus className="size-4" aria-hidden /> <span className="hidden sm:inline">{t.maps.suggestions.add}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
