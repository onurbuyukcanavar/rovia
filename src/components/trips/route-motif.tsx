import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/**
 * Gösterge yazısı: "1.234,5 km", "3 sa 20 dk" → rakamlar büyük ve ince, birimler küçük.
 * Metin içeriği (textContent) değişmez; e2e ve ekran okuyucular aynı dizgiyi görür.
 */
export function OdometerValue({ value, accent, leadOnly }: {
  value: string; accent?: boolean;
  /** Yalnızca ilk sayı büyük ("6,4 L/100 km" gibi birimin içinde sayı olan değerler için) */
  leadOnly?: boolean;
}) {
  const parts = value.split(/(\d[\d.,]*)/).filter(Boolean);
  const lead = parts.findIndex((p) => /^\d/.test(p));
  // Sayı yoksa ("Bilinmiyor", "—") düz ve okunur boyutta
  if (lead === -1) return <span className="text-[0.7em] font-normal tracking-normal text-fg-muted">{value}</span>;
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) && (!leadOnly || i === lead) ? (
          <span key={i} className={accent ? "text-accent-glow" : "text-fg"}>{p}</span>
        ) : (
          <span key={i} className="text-[0.55em] font-normal tracking-normal text-fg-muted">{p}</span>
        ),
      )}
    </>
  );
}

/** Başlangıç noktası → kesik yol çizgisi → amber varış noktası (süs; aria-hidden). */
export function RouteLine({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <div aria-hidden className={cn("flex items-center gap-2", className)}>
      <span className="size-2.5 shrink-0 rounded-full border-2 border-fg/80" />
      <span className="h-0 min-w-4 flex-1 border-t-2 border-dashed border-fg/25 transition-colors group-hover:border-accent/60" />
      <span className={cn("size-3 shrink-0 rounded-full", muted ? "border-2 border-fg/40" : "bg-accent shadow-[0_0_12px_rgb(232_145_45/0.7)]")} />
    </div>
  );
}

/** Rota motifi + altında başlangıç/varış adları. */
export function RouteEnds({ from, to, muted }: { from: ReactNode; to: ReactNode; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <RouteLine muted={muted} />
      <p className="mt-2 flex min-w-0 justify-between gap-3 text-sm text-fg-muted">
        <span className="min-w-0 truncate"><span className="sr-only">{t.dashboard.routeFrom}: </span>{from}</span>
        <span className="min-w-0 truncate text-right"><span className="sr-only">{t.dashboard.routeTo}: </span>{to}</span>
      </p>
    </div>
  );
}
