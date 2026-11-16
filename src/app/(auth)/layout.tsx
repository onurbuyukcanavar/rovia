import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { RouteIllustration } from "@/components/brand/route-illustration";
import { t } from "@/i18n";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:block">
        <RouteIllustration className="absolute inset-0 size-full" />
        <div className="relative flex h-full flex-col justify-between p-12 text-paper">
          <Link href="/" aria-label="ROVIA ana sayfa">
            <Logo inverted />
          </Link>
          <div className="max-w-md">
            <p lang="en" className="text-5xl leading-[1.05] font-extrabold tracking-tight">{t.brand.slogan}</p>
            <p className="mt-5 font-serif text-xl leading-relaxed text-paper/75 italic">{t.brand.tagline}</p>
          </div>
        </div>
      </aside>
      <main className="flex flex-col px-6 py-8 sm:px-10">
        <Link href="/" className="lg:hidden" aria-label="ROVIA ana sayfa">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
