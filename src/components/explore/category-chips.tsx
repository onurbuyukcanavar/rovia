"use client";
import {
  Castle, Church, Columns3, Droplets, Eye, Home, Landmark, Mountain, Sparkles, Trees, UtensilsCrossed, Waves,
  Building2, Moon, ScrollText, type LucideIcon,
} from "lucide-react";
import { CATEGORY_COLORS, EXPLORE_CATEGORY_KEYS, type ExploreCategory } from "@/lib/explore/categories";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

export const CATEGORY_ICONS: Record<ExploreCategory, LucideIcon> = {
  featured: Sparkles,
  historic: Landmark,
  ancient: Columns3,
  museum: Building2,
  mosque: Moon,
  church: Church,
  castle: Castle,
  park: Trees,
  lake: Waves,
  waterfall: Droplets,
  mountain: Mountain,
  viewpoint: Eye,
  village: Home,
  gastronomy: UtensilsCrossed,
  heritage: ScrollText,
};

/** Yatay kaydırılan kategori seçimi (radyo grubu). */
export function CategoryChips({ value, onChange }: { value: ExploreCategory; onChange: (c: ExploreCategory) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{t.explore.categoriesLabel}</legend>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:-mx-5 lg:px-5 [scrollbar-width:thin]" data-testid="explore-categories">
        {EXPLORE_CATEGORY_KEYS.map((k) => {
          const Icon = CATEGORY_ICONS[k];
          const on = k === value;
          return (
            <label key={k} className={cn(
              "relative inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border py-1 pr-3.5 pl-1 text-sm font-semibold whitespace-nowrap transition-colors select-none has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/30",
              on ? "border-fg bg-fg text-surface" : "border-line-strong bg-raised text-fg hover:border-accent/50",
            )}>
              <input type="radio" name="explore-category" className="sr-only" checked={on} onChange={() => onChange(k)} />
              {/* Kategori rengi haritadaki işaretlerle aynı; ikon renkli dolgu üzerinde beyaz (her iki temada görünür) */}
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: CATEGORY_COLORS[k] }}>
                <Icon className="size-3.5" />
              </span>
              {t.explore.categories[k]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
