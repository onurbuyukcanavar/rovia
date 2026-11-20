import { ArrowRight, ArrowDown, Plus, Smartphone } from "lucide-react";
import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";
import { LegalLinks } from "@/components/legal/legal-page";
import { AccountDeletedBanner } from "@/components/account/deleted-banner";
import { LandingScene } from "@/components/landing/landing-scene";
import { PhoneMockup } from "@/components/landing/phone-mockup";

const L = t.landing;

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-[#05080f] text-paper">
      <AccountDeletedBanner />
      {/* Sabit üst menü: kaydırmada ekranda kalır */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-paper/[0.06] bg-[#05080f]/92 pt-[env(safe-area-inset-top)] text-paper backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:h-18 sm:px-8">
          <Link href="/" aria-label="ROVIA" className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="size-8 shrink-0" title="" />
            <span className="hidden text-[1.05rem] font-extrabold tracking-[0.28em] min-[480px]:inline">ROVIA</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/giris" className="rounded-full px-3 py-2 text-sm font-semibold text-paper/80 hover:text-paper sm:px-4">
              {t.marketing.ctaSecondary}
            </Link>
            <ButtonLink href="/kayit" variant="accent" size="sm">{t.marketing.ctaPrimary}</ButtonLink>
          </nav>
        </div>
      </header>

      <main id="icerik">
        <div data-scene-root className="relative">
          <LandingScene />

          {/* 1 · Giriş: gece yolu */}
          <section className="relative z-10 flex min-h-svh flex-col justify-end px-5 pt-[calc(5rem+env(safe-area-inset-top))] pb-10 sm:px-8 lg:pb-14">
            <div className="mx-auto w-full max-w-7xl min-w-0">
              <div className="max-w-3xl min-w-0 [text-shadow:0_2px_24px_rgb(5_8_15/0.6)]">
                <p lang="en" className="text-xs font-semibold tracking-[0.32em] text-amber-400 uppercase">{t.brand.slogan}</p>
                <h1 className="mt-4 text-[clamp(2.6rem,11vw,6.4rem)] leading-[0.98] font-extralight tracking-[-0.035em] break-words">
                  {L.hero.titleLead}{" "}
                  <span className="font-serif font-normal text-amber-300 italic">{L.hero.titleAccent}</span>
                </h1>
                <p className="mt-6 max-w-xl text-base leading-relaxed text-paper/75 sm:text-lg">{L.hero.body}</p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <ButtonLink href="/kayit" variant="accent" size="lg">
                    {t.marketing.ctaPrimary} <ArrowRight className="size-4" aria-hidden />
                  </ButtonLink>
                  <ButtonLink href="/giris" variant="secondary" size="lg" className="border-paper/20 bg-paper/5 text-paper backdrop-blur-sm hover:border-paper/40 hover:bg-paper/10">
                    {t.marketing.ctaSecondary}
                  </ButtonLink>
                </div>
                <Link href="/indir" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-paper/70 underline-offset-4 hover:text-paper hover:underline">
                  <Smartphone className="size-4" aria-hidden /> {t.install.trigger}
                </Link>
              </div>

              <ul aria-label={L.statsLabel} className="mt-12 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-paper/10 pt-6 lg:mt-16 lg:grid-cols-4">
                {L.stats.map((s, i) => (
                  <li key={s.label} className="min-w-0">
                    <span className="block text-[0.7rem] font-semibold text-paper/40 tabular-nums">0{i + 1}</span>
                    <span className="mt-1 block text-base font-light break-words text-paper sm:text-lg">{s.value}</span>
                    <span className="block text-sm break-words text-paper/60">{s.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-8 hidden items-center gap-2 text-xs font-semibold tracking-[0.2em] text-paper/40 uppercase lg:flex" aria-hidden>
                <ArrowDown className="size-3.5 animate-bounce motion-reduce:animate-none" /> {L.hero.scroll}
              </p>
            </div>
          </section>

          {/* 2–4 · Keşfet, Yolculuk et, Hatırla: parçacıklar şekil değiştirir */}
          {L.chapters.map((c, i) => (
            <section key={c.key} data-scene-chapter aria-labelledby={`bolum-${c.key}`} className="relative z-10 h-[175svh] px-5 sm:px-8">
              <div className="mx-auto h-full w-full max-w-7xl pb-[45svh]">
                <div className="sticky top-[54svh] max-w-md min-w-0 lg:top-[calc(50svh-9rem)]">
                  <div className="-mx-5 bg-gradient-to-t from-[#05080f] via-[#05080f]/85 to-transparent px-5 pt-10 pb-8 sm:-mx-8 sm:px-8 lg:mx-0 lg:bg-none lg:p-0">
                    <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.24em] text-amber-400 uppercase">
                      <span className="text-paper/40 tabular-nums">{c.index}</span>
                      <span className="h-px w-8 bg-amber-400/60" aria-hidden />
                      {c.eyebrow}
                    </p>
                    <h2 id={`bolum-${c.key}`} className="mt-4 text-[clamp(2rem,8vw,3.6rem)] leading-[1.04] font-extralight tracking-[-0.03em] break-words">
                      {c.title}
                    </h2>
                    <p className="mt-4 leading-relaxed text-paper/70 sm:text-lg">{c.body}</p>
                    {i === 1 ? (
                      <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span aria-hidden className="text-4xl font-extralight text-amber-300 tabular-nums">
                          <span data-scene-km>830</span> <span className="text-lg text-paper/50">{L.odometer.unit}</span>
                        </span>
                        <span aria-hidden className="text-sm text-paper/50">{L.odometer.route}</span>
                        <span className="sr-only">{L.odometer.srLabel}</span>
                      </p>
                    ) : (
                      <ul className="mt-5 flex flex-wrap gap-2">
                        {c.tags.map((tag) => (
                          <li key={tag} className="rounded-full border border-paper/15 px-3 py-1 text-xs font-semibold text-paper/70">{tag}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* 5 · Aydınlık bölüm: uygulama */}
        <section aria-labelledby="yol-arkadasi" className="relative z-20 -mt-10 overflow-hidden rounded-t-[2.5rem] bg-paper text-ink-900">
          <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:py-32">
            <div className="min-w-0">
              <p className="eyebrow text-amber-700!">{L.companion.eyebrow}</p>
              <h2 id="yol-arkadasi" className="mt-4 text-[clamp(2.2rem,8vw,4.4rem)] leading-[1.02] font-extralight tracking-[-0.035em] break-words">
                {L.companion.title}
              </h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-stone-700">{L.companion.body}</p>
              <ol className="mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] border border-sand-200 bg-sand-200">
                {L.companion.features.map((f, i) => (
                  <li key={f.title} className="flex min-w-0 gap-5 bg-paper-50 p-5 sm:p-6">
                    <span className="font-serif text-2xl text-amber-600 italic tabular-nums" aria-hidden>0{i + 1}</span>
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold tracking-tight">{f.title}</h3>
                      <p className="mt-1 leading-relaxed text-stone-700">{f.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <PhoneMockup />
          </div>
        </section>

        {/* 6 · Sık sorulanlar */}
        <section aria-labelledby="sss" className="bg-paper text-ink-900">
          <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 border-t border-sand-200 px-5 pt-20 pb-28 sm:px-8 lg:grid-cols-[1fr_1.6fr] lg:pt-28 lg:pb-40">
            <div className="min-w-0">
              <p className="eyebrow">{L.faq.eyebrow}</p>
              <h2 id="sss" className="mt-4 text-[clamp(2rem,6vw,3.4rem)] leading-[1.05] font-extralight tracking-[-0.03em] break-words">{L.faq.title}</h2>
            </div>
            <div className="min-w-0 divide-y divide-sand-300 border-y border-sand-300">
              {L.faq.items.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-6 text-lg font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{f.q}</span>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-sand-300 transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" aria-hidden>
                      <Plus className="size-4" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pr-12 pb-6 leading-relaxed text-stone-700">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 7 · Son çağrı */}
        <section aria-labelledby="yola-cik" className="relative isolate z-20 -mt-10 overflow-hidden rounded-t-[2.5rem] bg-[#05080f] text-paper">
          <div aria-hidden className="landing-cta-glow absolute inset-0 -z-10" />
          {/* Ufka uzanan yol (durağan çizim) */}
          <svg aria-hidden viewBox="0 0 800 400" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 -z-10 h-[65%] w-full overflow-visible opacity-70 lg:left-[22%]">
            <defs>
              <radialGradient id="cta-sun">
                <stop offset="0" stopColor="#f0a94a" stopOpacity="0.55" />
                <stop offset="1" stopColor="#e8912d" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="400" cy="150" rx="320" ry="90" fill="url(#cta-sun)" />
            <path d="M-500 400 L 396 150 M 1300 400 L 404 150" stroke="rgb(247 245 240 / 0.3)" strokeWidth="1.2" fill="none" />
            <path d="M400 400 L 400 150" stroke="rgb(240 169 74 / 0.55)" strokeWidth="2" strokeDasharray="16 20" fill="none" />
            <path d="M-2000 150 L 2800 150" stroke="rgb(247 245 240 / 0.1)" strokeWidth="1" fill="none" />
          </svg>
          <div className="mx-auto max-w-7xl px-5 pt-24 pb-56 sm:px-8 lg:pt-36 lg:pb-28">
            <p lang="en" className="text-xs font-semibold tracking-[0.32em] text-amber-400 uppercase">{t.brand.slogan}</p>
            <h2 id="yola-cik" className="mt-4 text-[clamp(3.2rem,16vw,9rem)] leading-[0.92] font-extralight tracking-[-0.045em]">
              {L.final.title}
            </h2>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-paper/70">{L.final.body}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/kayit" variant="accent" size="lg">
                {t.marketing.ctaPrimary} <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href="/indir" variant="secondary" size="lg" className="border-paper/20 bg-paper/5 text-paper hover:border-paper/40 hover:bg-paper/10">
                <Smartphone className="size-4" aria-hidden /> Uygulamayı indir
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-paper/10 bg-[#05080f] text-paper/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-sm sm:px-8">
          <Logo inverted />
          <p>© 2026 ROVIA · {t.marketing.footer}</p>
          <LegalLinks className="w-full hover:[&_a]:text-paper sm:w-auto" />
        </div>
      </footer>
    </div>
  );
}
