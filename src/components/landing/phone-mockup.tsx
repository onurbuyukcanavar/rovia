import { LayoutDashboard, Map, Menu, Navigation, Radio, Route } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/i18n";

const M = t.landing.companion.mock;
const NAV_ICONS = [LayoutDashboard, Map, Route, Radio, Menu];

/** Ana sayfadaki telefon çizimi: uygulamanın üst çubuğu, harita, rota kartı ve alt menüsü (salt görsel). */
export function PhoneMockup() {
  return (
    <figure aria-hidden className="relative mx-auto w-full max-w-[19rem] min-w-0 lg:max-w-[21rem]">
      <div className="absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(240_169_74/0.28),transparent)]" />
      <div className="rounded-[2.6rem] bg-ink-950 p-2.5 shadow-[0_40px_80px_-30px_rgb(14_23_38/0.55),0_0_0_1px_rgb(14_23_38/0.08)]">
        <div className="relative overflow-hidden rounded-[2.1rem] bg-paper">
          {/* Durum çubuğu */}
          <div className="flex h-7 items-center justify-between bg-paper px-6 text-[0.6rem] font-bold text-ink-900">
            <span>09:41</span>
            <span className="h-4 w-16 rounded-full bg-ink-950" />
            <span>100%</span>
          </div>
          {/* Üst çubuk */}
          <div className="flex h-11 items-center justify-between border-b border-sand-200 px-4">
            <span className="flex items-center gap-2">
              <LogoMark className="size-6" title="" />
              <span className="text-[0.72rem] font-extrabold tracking-[0.26em]">ROVIA</span>
            </span>
            <span className="size-6 rounded-full bg-sand-200" />
          </div>
          {/* Harita */}
          <div className="relative h-[19rem] bg-[#ece7dc]">
            <svg viewBox="0 0 300 300" className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice">
              <rect width="300" height="300" fill="#ece7dc" />
              <path d="M-10 40 C 60 30 90 70 70 120 S 10 180 -10 200 Z" fill="#cfe0ea" />
              <path d="M210 310 C 220 250 270 240 310 230 L 310 310 Z" fill="#cfe0ea" />
              <path d="M150 -10 C 160 60 120 110 170 160 S 240 230 230 310" fill="none" stroke="#fff" strokeWidth="7" />
              <path d="M-10 150 C 60 140 120 170 200 140 S 280 120 310 130" fill="none" stroke="#fff" strokeWidth="5" />
              <path d="M40 -10 C 70 80 30 200 110 310" fill="none" stroke="#fff" strokeWidth="4" />
              <path d="M95 70 C 110 110 100 140 140 165 S 190 215 215 255" fill="none" stroke="#0e1726" strokeOpacity="0.18" strokeWidth="9" strokeLinecap="round" />
              <path d="M95 70 C 110 110 100 140 140 165 S 190 215 215 255" fill="none" stroke="#e8912d" strokeWidth="5" strokeLinecap="round" />
              <circle cx="95" cy="70" r="7" fill="#0e1726" stroke="#fff" strokeWidth="3" />
              <circle cx="104" cy="121" r="4.5" fill="#fff" stroke="#0e1726" strokeWidth="2.5" />
              <circle cx="152" cy="176" r="4.5" fill="#fff" stroke="#0e1726" strokeWidth="2.5" />
              <circle cx="190" cy="220" r="4.5" fill="#fff" stroke="#0e1726" strokeWidth="2.5" />
              <circle cx="215" cy="255" r="8" fill="#e8912d" stroke="#fff" strokeWidth="3" />
            </svg>
            <span className="absolute top-3 left-3 rounded-full bg-paper-50/95 px-3 py-1.5 text-[0.66rem] font-semibold text-ink-800 shadow-[var(--shadow-card)]">
              {M.greeting}
            </span>
            <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-paper-50/95 text-ink-900 shadow-[var(--shadow-card)]">
              <Navigation className="size-3.5" />
            </span>
          </div>
          {/* Rota kartı */}
          <div className="relative -mt-14 px-3 pb-3">
            <div className="rounded-2xl border border-sand-200 bg-paper-50 p-3.5 shadow-[0_12px_30px_-14px_rgb(14_23_38/0.35)]">
              <p className="text-[0.82rem] font-extrabold tracking-tight">
                {M.from} <span className="text-amber-600">→</span> {M.to}
              </p>
              <p className="mt-0.5 text-[0.66rem] font-semibold text-stone-600">{M.meta}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {M.stops.map((s) => (
                  <span key={s} className="rounded-full bg-sand-100 px-2 py-0.5 text-[0.62rem] font-semibold text-ink-800">{s}</span>
                ))}
              </div>
              <span className="mt-3 flex h-8 items-center justify-center rounded-full bg-amber-500 text-[0.7rem] font-bold text-ink-950">
                {M.start}
              </span>
            </div>
          </div>
          {/* Alt menü */}
          <div className="grid grid-cols-5 border-t border-sand-200 bg-paper/95 px-1 pt-1.5 pb-3">
            {M.nav.map((label, i) => {
              const Icon = NAV_ICONS[i];
              return (
                <span key={label} className={`flex min-w-0 flex-col items-center gap-0.5 ${i === 1 ? "text-ink-900" : "text-stone-500"}`}>
                  <Icon className="size-4" />
                  <span className="max-w-full truncate text-[0.52rem] font-semibold">{label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}
