import { cn } from "@/lib/cn";

/** Kartların köşesinde süs olarak duran yol çizgisi (panel hızlı işlemleriyle aynı motif). */
export function RoadMotif({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 100" preserveAspectRatio="none"
      className={cn("pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-1/2 opacity-70", className)}>
      <path d="M200 100 C 160 70 150 40 120 0" className="stroke-fg/15" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M150 100 C 128 70 122 40 104 0" className="stroke-accent/55" strokeWidth="1.5" strokeDasharray="6 7" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** "1.234,5 km", "3 sa 20 dk": rakamlar büyük, birimler küçük. Metin içeriği değişmez (e2e metni okur). */
export function GaugeValue({ value, accent }: { value: string; accent?: boolean }) {
  const parts = value.split(/(\d[\d.,:]*)/).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span key={i} className={accent ? "text-accent-glow" : "text-fg"}>{p}</span>
        ) : (
          <span key={i} className="text-[0.5em] font-normal tracking-normal text-fg-muted">{p}</span>
        ),
      )}
    </>
  );
}

/** Harita yan paneli başlığı: amber üst başlık + ince büyük başlık + açıklama. */
export function PanelHeading({ eyebrow, title, description, className }: {
  eyebrow: string; title: string; description?: string; className?: string;
}) {
  return (
    <header className={cn("relative isolate", className)}>
      <p className="eyebrow-accent">{eyebrow}</p>
      <h1 className="mt-3 text-[clamp(1.85rem,6vw,2.35rem)] leading-[1.05] font-extralight tracking-[-0.03em] break-words text-fg">{title}</h1>
      {description && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{description}</p>}
    </header>
  );
}
