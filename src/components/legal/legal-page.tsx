import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

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
    <div lang={lang} className="min-h-dvh bg-paper">
      <header className="border-b border-sand-200 bg-paper/95 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-5">
          <Link href="/" aria-label={tr ? "ROVIA ana sayfa" : "ROVIA home"}><Logo /></Link>
          <Link href={alternate.href} hrefLang={tr ? "en" : "tr"} className="text-sm font-semibold text-stone-600 underline-offset-2 hover:underline">
            {alternate.label}
          </Link>
        </div>
      </header>
      <main id="icerik" className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="eyebrow">ROVIA</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-stone-600">{tr ? "Son güncelleme" : "Last updated"}: {LEGAL_UPDATED[lang]}</p>
        <div className="mt-6 text-[1.02rem] leading-relaxed text-ink-800">{intro}</div>
        <div className="legal-prose mt-8 space-y-8">{children}</div>
      </main>
      <LegalFooter lang={lang} />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="space-y-3 leading-relaxed text-ink-800 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">{children}</div>
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
    <footer className="border-t border-sand-200">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-stone-600">
        <p>© 2026 ROVIA</p>
        <LegalLinks lang={lang} />
      </div>
    </footer>
  );
}
