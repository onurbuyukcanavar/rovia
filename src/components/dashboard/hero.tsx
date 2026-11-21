import type { ReactNode } from "react";

/**
 * Panelin gece zemini. Telefonda sabit üst çubuk ve alt menünün arkasına da uzanır
 * (ana içerik bu payları boşluk olarak bırakır); böylece yarı saydam menülerin altında açık zemin görünmez.
 */
export function PanelNight({ children }: { children: ReactNode }) {
  return (
    <div className="panel-night -mt-[var(--mobile-header)] -mb-[var(--mobile-nav)] min-h-dvh pt-[var(--mobile-header)] pb-[var(--mobile-nav)] text-paper lg:m-0 lg:p-0">
      {children}
    </div>
  );
}

/**
 * Karşılama alanı: ana sayfanın gece yolu sahnesinin hafif, durağan bir yorumu.
 * WebGL yok; ufuk ışıltısı CSS, ufka uzanan yol SVG. Şerit çizgisi akar, hareket azaltma tercihinde durur.
 */
export function PanelHero({ eyebrow, title, accent, body, cta, aside }: {
  eyebrow: string; title: string; accent: string; body: string; cta: ReactNode; aside?: ReactNode;
}) {
  return (
    <section className="panel-hero-sky relative isolate overflow-hidden rounded-[2rem] border border-paper/[0.08] px-5 pt-8 pb-36 sm:px-10 sm:pt-12 lg:min-h-[26rem] lg:pb-12">
      <Road className="absolute inset-x-0 top-[78%] bottom-0 -z-10 h-[22%] w-full lg:hidden" vp={480} />
      <Road className="absolute inset-x-0 top-[64%] bottom-0 -z-10 hidden h-[36%] w-full lg:block" vp={600} spread={420} fadeLeft />
      <div className="relative max-w-2xl min-w-0 [text-shadow:0_2px_24px_rgb(5_8_15/0.6)]">
        <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.24em] text-amber-400 uppercase">
          <span aria-hidden className="h-px w-8 shrink-0 bg-amber-400/60" />
          <span className="min-w-0 break-words">{eyebrow}</span>
        </p>
        <h1 className="mt-4 text-[clamp(2.1rem,8.5vw,4.2rem)] leading-[1.02] font-extralight tracking-[-0.035em] break-words">
          <span className="block">{title}.</span>
          <span className="block font-serif font-normal text-amber-300 italic">{accent}</span>
        </h1>
        <p className="mt-5 max-w-lg leading-relaxed text-paper/75 sm:text-lg">{body}</p>
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
          <stop offset="0" stopColor="#0a111d" stopOpacity="0" />
          <stop offset="1" stopColor="#05080f" stopOpacity="0.85" />
        </linearGradient>
        {/* Masaüstünde ufuk çizgisi metnin altından geçmesin: solda söner */}
        <linearGradient id={`horizon-${vp}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="800" y2="0">
          <stop offset={fadeLeft ? "0.45" : "0"} stopColor="#f7f5f0" stopOpacity="0" />
          <stop offset={fadeLeft ? "0.7" : "0.2"} stopColor="#f7f5f0" stopOpacity="0.16" />
        </linearGradient>
      </defs>
      <path d="M0 0.5 L 800 0.5" stroke={`url(#horizon-${vp})`} strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      <path
        d={`M${vp - 3} 0 C ${vp - 10} 90, ${end - 300} 180, ${end - spread} 300 L ${end + spread} 300 C ${end + 300} 180, ${vp + 20} 90, ${vp + 3} 0 Z`}
        fill={`url(#road-fill-${vp})`}
      />
      <path d={`M${vp - 3} 0 C ${vp - 10} 90, ${end - 300} 180, ${end - spread} 300`} stroke="rgb(247 245 240 / 0.32)" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={`M${vp + 3} 0 C ${vp + 20} 90, ${end + 300} 180, ${end + spread} 300`} stroke="rgb(247 245 240 / 0.32)" strokeWidth="1.2" fill="none" vectorEffect="non-scaling-stroke" />
      <path
        className="panel-road-dash"
        d={`M${vp} 0 C ${vp + 5} 90, ${end} 180, ${end} 300`}
        stroke="rgb(240 169 74 / 0.75)" strokeWidth="2" strokeDasharray="14 22" fill="none" vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
