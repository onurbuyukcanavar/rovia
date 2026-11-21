"use client";
import {
  BedDouble, Camera, Coffee, Cross, Fuel, Landmark, Library, LoaderCircle, Mountain, PlugZap, ShoppingBag, Tent, Utensils,
  type LucideIcon,
} from "lucide-react";
import { RADIUS_OPTIONS, ROUTE_CATEGORIES } from "@/lib/places/categories";
import type { FoundPlace } from "@/lib/maps/types";
import { formatDistance } from "@/lib/format";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, fuel: Fuel, "plug-zap": PlugZap, "bed-double": BedDouble, tent: Tent,
  mountain: Mountain, landmark: Landmark, library: Library, camera: Camera, "shopping-bag": ShoppingBag, cross: Cross,
};

type Props = {
  /** Numaralı üst başlık sırası */
  index?: number;
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

export function DiscoverPanel({ index, hasRoute, category, onCategory, radius, onRadius, results, loading, error, selectedId, onSelect }: Props) {
  return (
    <section aria-labelledby="discover-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <SectionEyebrow as="h2" id="discover-title" index={index}>{hasRoute ? t.maps.discover : t.maps.discoverNearby}</SectionEyebrow>
        <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
          {hasRoute ? t.maps.radius : t.maps.radiusCenter}
          <select value={radius} onChange={(e) => onRadius(Number(e.target.value))}
            className="h-8 rounded-lg border border-line-strong bg-field px-2 text-sm font-semibold text-fg outline-none focus:border-accent focus:ring-4 focus:ring-accent/20">
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
                active ? "border-accent/60 bg-accent-soft text-fg" : "border-line-strong bg-raised text-fg-muted hover:border-fg-subtle hover:text-fg",
              )}>
              <Icon className={cn("size-4", active ? "text-accent-ink" : "text-fg-subtle")} aria-hidden /> {c.label}
            </button>
          );
        })}
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {loading && (
        <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.common.loading}
        </p>
      )}
      {!loading && results && (
        <>
          <p className="text-xs font-semibold text-fg-muted" role="status">{t.maps.results(results.length)}</p>
          {results.length === 0 ? (
            <EmptyState icon={Landmark}>{t.maps.noResults}</EmptyState>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden" data-testid="results">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onSelect(p)} aria-current={p.id === selectedId}
                    className={cn("flex min-h-12 w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-fg/[0.04]", p.id === selectedId && "bg-accent-soft")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{p.name}</span>
                      <span className="block truncate text-xs text-fg-subtle">{[p.typeLabel, p.address].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-fg-muted tabular-nums">
                      {p.alongRoute !== null ? t.maps.fromRoute(formatDistance(p.distanceFromRoute)) : t.maps.fromCenter(formatDistance(p.distanceFromRoute))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-right text-[0.65rem] text-fg-subtle">{t.maps.dataNote}</p>
        </>
      )}
    </section>
  );
}
