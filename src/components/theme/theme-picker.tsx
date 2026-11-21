"use client";
import { MonitorSmartphone, Moon, Sun } from "lucide-react";
import { useId } from "react";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme/theme";
import { chooseTheme } from "./choose-theme";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { useResolvedTheme, useThemePreference } from "./use-theme";

const ICONS = { dark: Moon, light: Sun, system: MonitorSmartphone } as const;
const T = t.theme;

/**
 * Koyu · Aydınlık · Sistem seçimi: yerel radyo düğmeleri (ok tuşlarıyla gezinme ve ekran okuyucu desteği
 * tarayıcıdan gelir), bölümlü denetim görünümünde. Seçim anında uygulanır ve çereze yazılır.
 * compact: yalnızca simge + kısa etiket (Diğer sayfası, menüler).
 */
export function ThemePicker({ compact = false, className }: { compact?: boolean; className?: string }) {
  const pref = useThemePreference();
  const resolved = useResolvedTheme();
  const name = useId();
  return (
    <div className={className}>
      <fieldset>
        <legend className="sr-only">{T.label}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-sunken p-1" data-testid="theme-picker">
          {THEME_PREFERENCES.map((p: ThemePreference) => {
            const Icon = ICONS[p];
            const active = pref === p;
            return (
              <label key={p}
                className={cn(
                  "flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-2 text-center transition-[background-color,color,box-shadow] duration-200 motion-reduce:transition-none",
                  compact ? "min-h-11 py-1.5" : "min-h-16 py-2.5",
                  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-focus",
                  active
                    ? "bg-raised text-fg shadow-[var(--shadow-card)] ring-1 ring-line-strong"
                    : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
                )}>
                <input type="radio" name={name} value={p} checked={active} className="sr-only"
                  onChange={() => chooseTheme(p)} />
                <span className="flex items-center gap-1.5">
                  <Icon className={cn("size-4 shrink-0", active && "text-accent-ink")} aria-hidden />
                  <span className="text-sm font-semibold">{T.options[p].label}</span>
                </span>
                {!compact && <span className="hidden text-xs text-fg-subtle sm:block">{T.options[p].hint}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      {!compact && pref === "system" && (
        <p className="mt-2 text-xs text-fg-subtle" aria-live="polite">{T.systemNow(resolved)}</p>
      )}
    </div>
  );
}
