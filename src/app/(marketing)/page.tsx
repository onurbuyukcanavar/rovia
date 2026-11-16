import { ArrowRight, BookOpenText, Compass, Route } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { RouteIllustration } from "@/components/brand/route-illustration";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";

const ICONS = { discover: Compass, journey: Route, remember: BookOpenText } as const;

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <section className="relative isolate overflow-hidden bg-ink-900 text-paper">
        <RouteIllustration className="absolute inset-0 -z-10 size-full opacity-40 md:opacity-90" />
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Logo inverted />
          <nav className="flex items-center gap-2">
            <Link href="/giris" className="rounded-full px-4 py-2 text-sm font-semibold text-paper/80 hover:text-paper">
              {t.marketing.ctaSecondary}
            </Link>
            <ButtonLink href="/kayit" variant="accent" size="sm">{t.marketing.ctaPrimary}</ButtonLink>
          </nav>
        </header>
        <div id="icerik" className="mx-auto max-w-6xl px-6 pt-16 pb-28 sm:pt-24 sm:pb-36">
          <p lang="en" className="eyebrow text-amber-400!">{t.brand.slogan}</p>
          <h1 className="mt-4 max-w-3xl text-5xl leading-[1.02] font-extrabold tracking-tight sm:text-7xl">
            {t.marketing.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-paper/75">{t.marketing.heroBody}</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/kayit" variant="accent" size="lg">
              {t.marketing.ctaPrimary} <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/giris" variant="secondary" size="lg" className="border-paper/20 bg-paper/5 text-paper hover:bg-paper/10 hover:border-paper/40">
              {t.marketing.ctaSecondary}
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="max-w-2xl font-serif text-3xl leading-snug text-ink-800 italic">“{t.brand.tagline}”</p>
        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {t.marketing.pillars.map((p, i) => {
            const Icon = ICONS[p.key];
            return (
              <li key={p.key} className="card p-7">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-ink-900 text-amber-400">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="text-sm font-bold text-stone-500 tabular-nums">0{i + 1}</span>
                </div>
                <h2 className="mt-6 text-2xl font-extrabold tracking-tight">{p.title}</h2>
                <p className="text-sm font-semibold text-amber-700">{p.subtitle}</p>
                <p className="mt-3 leading-relaxed text-stone-700">{p.body}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <footer className="border-t border-sand-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-stone-600">
          <Logo />
          <p>© 2026 ROVIA · {t.marketing.footer}</p>
        </div>
      </footer>
    </div>
  );
}
