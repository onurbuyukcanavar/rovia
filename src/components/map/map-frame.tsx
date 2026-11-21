"use client";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/** Telefon boyutu mu (masaüstünde harita zaten geniş; dokunmayla büyütme yalnızca mobilde) */
export const isMobileViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

/**
 * Büyütülebilir harita alanı. Büyütülünce harita tüm ekranı kaplar (menüler dahil);
 * "Küçült" düğmesi, Esc tuşu ve telefonun geri hareketi eski görünüme döndürür.
 */
export function useMapExpand() {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    // Geri hareketi/tuşu sayfadan çıkmak yerine haritayı küçültsün
    window.history.pushState({ roviaMap: true }, "");
    const onPop = () => setExpanded(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") window.history.back();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  return {
    expanded,
    expand: () => setExpanded(true),
    /** Küçült: eklenen geçmiş kaydını geri alarak (popstate durumu kapatır) */
    collapse: () => {
      if (window.history.state?.roviaMap) window.history.back();
      else setExpanded(false);
    },
  };
}

type Props = {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  className?: string;
  children: ReactNode;
  testId?: string;
};

export function MapFrame({ expanded, onExpand, onCollapse, className, children, testId }: Props) {
  return (
    <div
      className={cn(expanded ? "fixed inset-0 z-50 h-dvh w-full bg-surface" : cn("relative", className))}
      data-testid={testId}
      data-expanded={expanded || undefined}
    >
      {children}
      <button
        type="button"
        onClick={expanded ? onCollapse : onExpand}
        aria-label={expanded ? t.maps.collapseMap : t.maps.expandMap}
        aria-pressed={expanded}
        className={cn(
          "absolute z-20 flex items-center gap-1.5 rounded-full border border-line-strong bg-overlay font-semibold text-fg shadow-[var(--shadow-overlay)] backdrop-blur transition-colors hover:border-accent/50 hover:text-accent-ink",
          expanded
            ? "top-[calc(env(safe-area-inset-top)+0.75rem)] left-[max(0.75rem,env(safe-area-inset-left))] h-11 px-4 text-sm"
            : "top-2.5 left-2.5 size-10 justify-center lg:hidden",
        )}
      >
        {expanded ? <><Minimize2 className="size-4" aria-hidden /> {t.maps.collapseMap}</> : <Maximize2 className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
