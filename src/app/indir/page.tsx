import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Download, EllipsisVertical, Plus, Share, Smartphone, SquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LegalLinks } from "@/components/legal/legal-page";
import { Badge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { SectionEyebrow, SectionTitle } from "@/components/ui/section-eyebrow";
import { ANDROID_APK_URL } from "@/lib/platform";
import { t } from "@/i18n";

const m = t.install;

export const metadata: Metadata = { title: m.page.title, description: m.page.lead };

/**
 * Herkese açık indirme sayfası: Android APK, Android ve iPhone ana ekran yönergeleri, SSS.
 * Ziyaretçinin temasını izler (çerez yoksa varsayılan koyu); karşılama, paneldeki ufuk sahnesidir.
 */
export default function DownloadPage() {
  const c = m.page.cards;
  return (
    <div className="min-h-dvh text-fg">
      <section className="panel-hero-sky relative isolate overflow-hidden border-b border-line">
        <RoadScene />
        <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5 pt-[env(safe-area-inset-top)] sm:px-8">
          <Link href="/" aria-label="ROVIA ana sayfa"><Logo /></Link>
          <Link href="/panel" className="rounded-full px-3 py-2 text-sm font-semibold text-fg-muted hover:bg-fg/[0.06] hover:text-fg">{m.page.openApp}</Link>
        </header>
        <div id="icerik" data-themed className="mx-auto max-w-5xl px-5 pt-12 pb-32 sm:px-8 sm:pt-20 sm:pb-36">
          <SectionEyebrow>{m.page.eyebrow}</SectionEyebrow>
          <h1 className="mt-4 text-[clamp(2.6rem,10vw,4.6rem)] leading-[1.02] font-extralight tracking-[-0.035em] break-words">
            {m.page.title} <span className="font-serif font-normal text-accent-glow italic">{m.page.titleAccent}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-fg-muted">{m.page.lead}</p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-5 pb-16 sm:px-8">
        <ol className="relative -mt-20 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Card index={1} icon={<Download />} title={c.apk.title} badge={c.apk.badge} body={c.apk.body} featured>
            <a href={ANDROID_APK_URL} rel="noopener" className={buttonClass("accent", "md", "w-full")}>
              <Download className="size-4" aria-hidden /> {c.apk.cta}
            </a>
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">{c.apk.note}</p>
          </Card>
          <Card index={2} icon={<Smartphone />} title={c.androidHome.title} badge={c.androidHome.badge} body={c.androidHome.body}>
            <Steps items={[[<EllipsisVertical key="i" />, m.android.menuSteps[0]], [<SquarePlus key="i" />, m.android.menuSteps[1]]]} />
          </Card>
          <Card index={3} icon={<Share />} title={c.ios.title} badge={c.ios.badge} body={c.ios.body}>
            <Steps items={[[<Compass key="i" />, m.ios.steps[0]], [<Share key="i" />, m.ios.steps[1]], [<SquarePlus key="i" />, m.ios.steps[2]]]} />
          </Card>
        </ol>

        <section aria-labelledby="indir-sss" className="mt-20 max-w-3xl">
          <SectionTitle id="indir-sss" index={4}>{m.page.faqTitle}</SectionTitle>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {m.page.faq.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-5 font-semibold text-fg marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">{f.q}</span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line-strong text-fg-muted transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" aria-hidden>
                    <Plus className="size-4" />
                  </span>
                </summary>
                <p className="max-w-2xl pr-12 pb-5 leading-relaxed text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12">
          <ButtonLink href="/kayit" variant="primary" size="lg">{t.marketing.ctaPrimary}</ButtonLink>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-sm text-fg-muted sm:px-8">
          <p>© 2026 ROVIA</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

/** Ufka uzanan yol (durağan çizim; ana sayfanın son bölümündeki sahnenin hafif yorumu). */
function RoadScene() {
  return (
    <svg aria-hidden viewBox="0 0 800 400" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 -z-10 size-full opacity-70">
      <path d="M-300 400 L 596 330 M 1400 400 L 604 330" className="stroke-fg/20" strokeWidth="1.2" fill="none" />
      <path d="M600 400 L 600 330" className="stroke-accent/55" strokeWidth="2" strokeDasharray="16 20" fill="none" />
      <path d="M-200 330 L 1100 330" className="stroke-fg/10" strokeWidth="1" fill="none" />
    </svg>
  );
}

function Card({ index, icon, title, badge, body, featured = false, children }: {
  index: number; icon: ReactNode; title: string; badge: string; body: string; featured?: boolean; children: ReactNode;
}) {
  return (
    <li className={featured ? "card glass flex flex-col border-accent/35 p-6" : "card glass flex flex-col p-6"}>
      <div className="flex items-center justify-between gap-3">
        <span className={featured
          ? "grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg [&>svg]:size-6"
          : "grid size-12 place-items-center rounded-2xl border border-line bg-raised text-accent-ink [&>svg]:size-6"} aria-hidden>{icon}</span>
        <span className="flex items-center gap-3">
          <Badge tone={featured ? "accent" : "neutral"}>{badge}</Badge>
          <span aria-hidden className="font-serif text-xl text-accent-glow italic tabular-nums">{String(index).padStart(2, "0")}</span>
        </span>
      </div>
      <h2 className="mt-5 text-xl font-semibold tracking-tight text-fg">{title}</h2>
      <p className="mt-2 mb-5 flex-1 leading-relaxed text-fg-muted">{body}</p>
      <div>{children}</div>
    </li>
  );
}

function Steps({ items }: { items: [ReactNode, string][] }) {
  return (
    <ol className="space-y-2">
      {items.map(([icon, text], i) => (
        <li key={i} className="flex items-center gap-3 text-sm text-fg-muted">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-sunken text-accent-ink [&>svg]:size-4" aria-hidden>{icon}</span>
          {text}
        </li>
      ))}
    </ol>
  );
}
