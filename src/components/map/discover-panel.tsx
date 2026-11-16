"use client";
import {
  BedDouble, Camera, Coffee, Cross, Fuel, Landmark, Library, LoaderCircle, Mountain, PlugZap, ShoppingBag, Tent, Utensils,
  type LucideIcon,
} from "lucide-react";
import { RADIUS_OPTIONS, ROUTE_CATEGORIES } from "@/lib/places/categories";
import type { FoundPlace } from "@/lib/maps/types";
import { formatDistance } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, fuel: Fuel, "plug-zap": PlugZap, "bed-double": BedDouble, tent: Tent,
  mountain: Mountain, landmark: Landmark, library: Library, camera: Camera, "shopping-bag": ShoppingBag, cross: Cross,
};

type Props = {
  hasRoute: boolean;
  category: string | null;
  onCategory: (key: string | null) => void;
  radius: number;
  onRadius: (r: number) => void;
  results: FoundPlace[] | null;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (p: FoundPlace) => void;
};

export function DiscoverPanel({ hasRoute, category, onCategory, radius, onRadius, results, loading, error, selectedId, onSelect }: Props) {
  return (
    <section aria-labelledby="discover-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="discover-title" className="text-base font-bold">{hasRoute ? t.maps.discover : t.maps.discoverNearby}</h2>
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
          {hasRoute ? t.maps.radius : t.maps.radiusCenter}
          <select value={radius} onChange={(e) => onRadius(Number(e.target.value))}
            className="h-8 rounded-lg border border-sand-300 bg-white px-2 text-sm font-semibold text-ink-900">
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{formatDistance(r)}</option>)}
          </select>
        </label>
      </div>

      <div role="group" aria-label={t.maps.categories} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {ROUTE_CATEGORIES.map((c) => {
          const Icon = ICONS[c.icon] ?? Landmark;
          const active = category === c.key;
          return (
            <button key={c.key} type="button" aria-pressed={active} onClick={() => onCategory(active ? null : c.key)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition",
                active ? "border-ink-900 bg-ink-900 text-paper" : "border-sand-300 bg-white text-ink-800 hover:border-stone-500",
              )}>
              <Icon className={cn("size-4", active && "text-amber-400")} aria-hidden /> {c.label}
            </button>
          );
        })}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && (
        <p className="flex items-center gap-2 text-sm text-stone-600" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.common.loading}
        </p>
      )}
      {!loading && results && (
        <>
          <p className="text-xs font-semibold text-stone-600" role="status">{t.maps.results(results.length)}</p>
          {results.length === 0 ? (
            <p className="rounded-xl bg-sand-100/70 p-3 text-sm text-stone-600">{t.maps.noResults}</p>
          ) : (
            <ul className="divide-y divide-sand-200 overflow-hidden rounded-xl border border-sand-200 bg-white" data-testid="results">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onSelect(p)} aria-current={p.id === selectedId}
                    className={cn("flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-sand-100/60", p.id === selectedId && "bg-amber-400/15")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-stone-600">{[p.typeLabel, p.address].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-stone-700 tabular-nums">
                      {p.alongRoute !== null ? t.maps.fromRoute(formatDistance(p.distanceFromRoute)) : t.maps.fromCenter(formatDistance(p.distanceFromRoute))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-right text-[0.65rem] text-stone-500">{t.maps.dataNote}</p>
        </>
      )}
    </section>
  );
}
