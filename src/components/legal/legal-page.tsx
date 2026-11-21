import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

export const LEGAL_UPDATED = { tr: "18 Kasım 2026", en: "18 November 2026" };
export const CONTACT_EMAIL = "onurbuyukcanavar@gmail.com";

type Props = {
  lang: "tr" | "en";
  title: string;
  intro: ReactNode;
  /** Diğer dildeki karşılığı */
  alternate: { href: string; label: string };
  children: ReactNode;
};

/** Gizlilik politikası ve kullanım koşulları için sade, herkese açık sayfa düzeni. */
export function LegalPage({ lang, title, intro, alternate, children }: Props) {
  const tr = lang === "tr";
  return (
    <div lang={lang} className="min-h-dvh bg-surface text-fg">
      <header className="border-b border-line bg-chrome pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5">
          <Link href="/" aria-label={tr ? "ROVIA ana sayfa" : "ROVIA home"}><Logo /></Link>
          <Link href={alternate.href} hrefLang={tr ? "en" : "tr"} className="text-sm font-semibold text-fg-muted underline-offset-2 hover:text-fg hover:underline">
            {alternate.label}
          </Link>
        </div>
      </header>
      <main id="icerik" data-themed className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <SectionEyebrow>ROVIA</SectionEyebrow>
        <h1 className="mt-4 text-[clamp(2rem,6vw,3rem)] leading-[1.06] font-extralight tracking-[-0.03em] break-words">{title}</h1>
        <p className="mt-3 text-sm text-fg-subtle">{tr ? "Son güncelleme" : "Last updated"}: {LEGAL_UPDATED[lang]}</p>
        <div className="mt-6 text-[1.02rem] leading-relaxed text-fg-muted">{intro}</div>
        <div className="legal-prose mt-8 space-y-8">{children}</div>
      </main>
      <LegalFooter lang={lang} />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-fg">{title}</h2>
      <div className="space-y-3 leading-relaxed text-fg-muted [&_strong]:text-fg [&_a]:text-accent-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">{children}</div>
    </section>
  );
}

/** Ana sayfa, giriş ve yasal sayfalarda kullanılan bağlantılar. */
export function LegalLinks({ lang = "tr", className }: { lang?: "tr" | "en"; className?: string }) {
  const tr = lang === "tr";
  return (
    <nav aria-label={tr ? "Yasal" : "Legal"} className={className}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li><Link href={tr ? "/gizlilik" : "/privacy"} className="underline-offset-2 hover:underline">{tr ? "Gizlilik Politikası" : "Privacy Policy"}</Link></li>
        <li><Link href={tr ? "/kullanim-kosullari" : "/terms"} className="underline-offset-2 hover:underline">{tr ? "Kullanım Koşulları" : "Terms of Service"}</Link></li>
        {tr && <li><Link href="/indir" className="underline-offset-2 hover:underline">Uygulamayı indir</Link></li>}
        <li><a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-2 hover:underline">{tr ? "İletişim" : "Contact"}</a></li>
      </ul>
    </nav>
  );
}

function LegalFooter({ lang }: { lang: "tr" | "en" }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-fg-subtle">
        <p>© 2026 ROVIA</p>
        <LegalLinks lang={lang} />
      </div>
    </footer>
  );
}
