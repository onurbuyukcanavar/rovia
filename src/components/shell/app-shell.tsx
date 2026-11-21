import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { MobileNav, MobileNavLive, SidebarNav, SidebarNavLive } from "./nav-link";
import { MobileHeaderAvatar, SidebarUser } from "./user-menu";
import { t } from "@/i18n";
import { InstallHeaderButton } from "@/components/install/install-trigger";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Masaüstü: sol navigasyon */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-paper/[0.06] bg-ink-900 px-4 py-6 lg:flex">
        <Link href="/panel" className="px-2" aria-label="ROVIA panel">
          <Logo inverted />
        </Link>
        <nav aria-label="Ana menü" className="scroll-quiet mt-8 flex-1 space-y-0.5 overflow-y-auto">
          <Suspense fallback={<SidebarNav pathname={null} />}>
            <SidebarNavLive />
          </Suspense>
        </nav>
        <Suspense fallback={<div className="h-14 animate-pulse rounded-2xl bg-paper/5" />}>
          <SidebarUser />
        </Suspense>
      </aside>

      {/* Mobil: üst çubuk (masaüstü kenar çubuğu ve tema rengiyle aynı gece laciverti) */}
      {/* Sabit (fixed): kaydırmada ve iOS'ta yerinde kalır; çentik/durum çubuğu payı üstte */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-paper/[0.07] bg-ink-950/95 pt-[env(safe-area-inset-top)] text-paper backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <Link href="/panel" aria-label="ROVIA panel"><Logo inverted /></Link>
          <div className="flex items-center gap-1.5">
            <InstallHeaderButton />
            <Suspense fallback={<span className="size-8 rounded-full bg-paper/10" />}>
              <MobileHeaderAvatar />
            </Suspense>
          </div>
        </div>
      </header>

      <main id="icerik" className="min-w-0 pt-[var(--mobile-header)] pb-[var(--mobile-nav)] lg:pt-0 lg:pb-0">{children}</main>

      {/* Mobil: alt navigasyon */}
      <nav aria-label="Alt menü"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-paper/[0.07] bg-ink-950/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur lg:hidden">
        <Suspense fallback={<MobileNav pathname={null} />}>
          <MobileNavLive />
        </Suspense>
      </nav>
      <span className="sr-only">{t.brand.slogan}</span>
    </div>
  );
}
