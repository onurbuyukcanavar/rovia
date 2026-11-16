import { cn } from "@/lib/cn";

/**
 * ROVIA logosu: kıvrılan bir yol çizgisi ve amber renkli varış noktası.
 * Küçük boyutlarda (16 px) da okunacak şekilde tek kalın çizgiyle tasarlandı.
 */
export function LogoMark({ className, title = "ROVIA" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} role="img" aria-label={title}>
      <rect width="64" height="64" rx="16" fill="#0e1726" />
      <path
        d="M17 48c0-9 7.5-11 14.5-12.5S44 31 44 24.5 38 17 31.5 18"
        fill="none"
        stroke="#f7f5f0"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <circle cx="17" cy="48" r="3.2" fill="#0e1726" stroke="#f7f5f0" strokeWidth="2.6" />
      <circle cx="44.5" cy="17.5" r="5.2" fill="#e8912d" />
    </svg>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-8" />
      <span
        className={cn(
          "text-[1.05rem] font-extrabold tracking-[0.28em]",
          inverted ? "text-paper" : "text-ink-900",
        )}
      >
        ROVIA
      </span>
    </span>
  );
}
