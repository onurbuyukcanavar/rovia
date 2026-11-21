import type { ReactNode } from "react";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

/**
 * Panel zemini: üstte hafif bir ufuk ışıltısı (koyuda lacivert, aydınlıkta amber). data-themed: sayfa tema
 * token'larıyla yazıldı (globals.css'teki geçiş kuralı bu sayfaya uygulanmaz).
 */
export function PanelBackdrop({ children }: { children: ReactNode }) {
  return (
    <div data-themed className="page-backdrop text-fg">
      {children}
    </div>
  );
}

/**
 * Karşılama alanı: ana sayfanın yol sahnesinin hafif, durağan bir yorumu (koyuda gece, aydınlıkta gün doğumu).
 * WebGL yok; ufuk ışıltısı CSS (--sky-* değişkenleri), ufka uzanan yol SVG. Şerit çizgisi akar, hareket azaltma tercihinde durur.
 */
export function PanelHero({ eyebrow, title, accent, body, cta, aside }: {
  eyebrow: string; title: string; accent: string; body: string; cta: ReactNode; aside?: ReactNode;
}) {
  return (
    <section className="panel-hero-sky relative isolate overflow-hidden rounded-[2rem] border border-line px-5 pt-8 pb-36 sm:px-10 sm:pt-12 lg:min-h-[26rem] lg:pb-12">
      <Road className="absolute inset-x-0 top-[78%] bottom-0 -z-10 h-[22%] w-full lg:hidden" vp={480} />
      <Road className="absolute inset-x-0 top-[64%] bottom-0 -z-10 hidden h-[36%] w-full lg:block" vp={600} spread={420} fadeLeft />
      <div className="relative max-w-2xl min-w-0 [text-shadow:0_2px_24px_var(--sky-mid)]">
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h1 className="mt-4 text-[clamp(2.1rem,8.5vw,4.2rem)] leading-[1.02] font-extralight tracking-[-0.035em] break-words">
          <span className="block">{title}.</span>
          <span className="block font-serif font-normal text-accent-glow italic">{accent}</span>
        </h1>
        <p className="mt-5 max-w-lg leading-relaxed text-fg-muted sm:text-lg">{body}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">{cta}</div>
        {aside && <div className="mt-5 xl:hidden">{aside}</div>}
      </div>
      {aside && <div className="absolute top-12 right-10 hidden xl:block">{aside}</div>}
    </section>
  );
}

/** Ufuk çizgisinden (üst kenar) aşağı açılan, hafifçe kıvrılan yol. vp: kaçış noktasının x'i (0–800). */
function Road({ className, vp, spread = 620, fadeLeft = false }: { className: string; vp: number; spread?: number; fadeLeft?: boolean }) {
  const end = vp - 140;
  return (
    <svg aria-hidden viewBox="0 0 800 300" preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id={`road-fill-${vp}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--road-fill)" }} stopOpacity="0" />
          <stop offset="1" style={{ stopColor: "var(--road-fill)" }} />
        </linearGradient>
        {/* Masaüstünde ufuk çizgisi metnin altından geçmesin: solda söner */}
        <linearGradient id={`horizon-${vp}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="800" y2="0">
          <stop offset={fadeLeft ? "0.45" : "0"} style={{ stopColor: "var(--color-fg)" }} stopOpacity="0" />
          <stop offset={fadeLeft ? "0.7" : "0.2"} style={{ stopColor: "var(--color-fg)" }} stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <path d="M0 0.5 L 800 0.5" stroke={`url(#horizon-${vp})`} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      <path
        d={`M${vp - 3} 0 C ${vp - 10} 90, ${end - 300} 180, ${end - spread} 300 L ${end + spread} 300 C ${end + 300} 180, ${vp + 20} 90, ${vp + 3} 0 Z`}
        fill={`url(#road-fill-${vp})`}
      />
      <path d={`M${vp - 3} 0 C ${vp - 10} 90, ${end - 300} 180, ${end - spread} 300`} className="stroke-fg/30" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={`M${vp + 3} 0 C ${vp + 20} 90, ${end + 300} 180, ${end + spread} 300`} className="stroke-fg/30" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
      <path
        className="panel-road-dash stroke-accent/75"
        d={`M${vp} 0 C ${vp + 5} 90, ${end} 180, ${end} 300`} strokeWidth="2" strokeDasharray="14 22" fill="none" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
