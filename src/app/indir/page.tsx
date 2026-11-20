import type { Metadata } from "next";
import Link from "next/link";
import { Compass, Download, EllipsisVertical, Share, Smartphone, SquarePlus } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LegalLinks } from "@/components/legal/legal-page";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { ANDROID_APK_URL } from "@/lib/platform";
import { t } from "@/i18n";

const m = t.install;

export const metadata: Metadata = { title: m.page.title, description: m.page.lead };

/** Herkese açık indirme sayfası: Android APK, Android ve iPhone ana ekran yönergeleri, SSS. */
export default function DownloadPage() {
  const c = m.page.cards;
  return (
    <div className="min-h-dvh bg-paper">
      <section className="bg-ink-900 text-paper">
        <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5 pt-[env(safe-area-inset-top)]">
          <Link href="/" aria-label="ROVIA ana sayfa"><Logo inverted /></Link>
          <Link href="/panel" className="rounded-full px-3 py-2 text-sm font-semibold text-paper/80 hover:text-paper">{m.page.openApp}</Link>
        </header>
        <div id="icerik" className="mx-auto max-w-5xl px-5 pt-10 pb-16 sm:pt-16 sm:pb-20">
          <p className="eyebrow text-amber-400!">{m.page.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{m.page.title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-paper/75">{m.page.lead}</p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-5 py-12">
        <div className="-mt-20 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Card icon={<Download />} title={c.apk.title} badge={c.apk.badge} body={c.apk.body}>
            <a href={ANDROID_APK_URL} rel="noopener" className={buttonClass("accent", "md", "w-full")}>
              <Download className="size-4" aria-hidden /> {c.apk.cta}
            </a>
            <p className="mt-3 text-sm text-stone-600">{c.apk.note}</p>
          </Card>
          <Card icon={<Smartphone />} title={c.androidHome.title} badge={c.androidHome.badge} body={c.androidHome.body}>
            <Steps items={[[<EllipsisVertical key="i" />, m.android.menuSteps[0]], [<SquarePlus key="i" />, m.android.menuSteps[1]]]} />
          </Card>
          <Card icon={<Share />} title={c.ios.title} badge={c.ios.badge} body={c.ios.body}>
            <Steps items={[[<Compass key="i" />, m.ios.steps[0]], [<Share key="i" />, m.ios.steps[1]], [<SquarePlus key="i" />, m.ios.steps[2]]]} />
          </Card>
        </div>

        <section className="mt-16 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight">{m.page.faqTitle}</h2>
          <div className="card mt-5 divide-y divide-sand-200">
            {m.page.faq.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-3">{f.q}<span className="text-stone-500 transition-transform group-open:rotate-45" aria-hidden>+</span></span>
                </summary>
                <p className="mt-2 leading-relaxed text-stone-700">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12">
          <ButtonLink href="/kayit" variant="primary">{t.marketing.ctaPrimary}</ButtonLink>
        </div>
      </main>

      <footer className="border-t border-sand-200">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-stone-600">
          <p>© 2026 ROVIA</p>
          <LegalLinks />
        </div>
      </footer>
    </div>
  );
}

function Card({ icon, title, badge, body, children }: { icon: ReactNode; title: string; badge: string; body: string; children: ReactNode }) {
  return (
    <article className="card flex flex-col p-6">
      <div className="flex items-center justify-between">
        <span className="grid size-12 place-items-center rounded-2xl bg-ink-900 text-amber-400 [&>svg]:size-6" aria-hidden>{icon}</span>
        <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-bold text-stone-600">{badge}</span>
      </div>
      <h2 className="mt-5 text-xl font-extrabold tracking-tight">{title}</h2>
      <p className="mt-2 mb-5 flex-1 leading-relaxed text-stone-700">{body}</p>
      <div>{children}</div>
    </article>
  );
}

function Steps({ items }: { items: [ReactNode, string][] }) {
  return (
    <ol className="space-y-2">
      {items.map(([icon, text], i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sand-100 text-ink-800 [&>svg]:size-4" aria-hidden>{icon}</span>
          {text}
        </li>
      ))}
    </ol>
  );
}
