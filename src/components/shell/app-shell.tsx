import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { NAV_ITEMS } from "@/config/navigation";
import { MobileTab, MoreTab, SidebarLink } from "./nav-link";
import { MobileHeaderAvatar, SidebarUser } from "./user-menu";
import { t } from "@/i18n";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Masaüstü: sol navigasyon */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink-900 px-4 py-6 lg:flex">
        <Link href="/panel" className="px-2" aria-label="ROVIA panel">
          <Logo inverted />
        </Link>
        <nav aria-label="Ana menü" className="mt-8 flex-1 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => <SidebarLink key={item.key} itemKey={item.key} />)}
        </nav>
        <Suspense fallback={<div className="h-14 animate-pulse rounded-2xl bg-paper/5" />}>
          <SidebarUser />
        </Suspense>
      </aside>

      {/* Mobil: üst çubuk */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-sand-200 bg-paper/90 px-4 backdrop-blur lg:hidden">
        <Link href="/panel" aria-label="ROVIA panel"><Logo /></Link>
        <Suspense fallback={<span className="size-8 rounded-full bg-sand-200" />}>
          <MobileHeaderAvatar />
        </Suspense>
      </header>

      <main id="icerik" className="min-w-0 pb-28 lg:pb-0">{children}</main>

      {/* Mobil: alt navigasyon */}
      <nav aria-label="Alt menü"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-sand-200 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <MobileTab itemKey="overview" />
        <MobileTab itemKey="map" />
        <MobileTab itemKey="record" emphasized />
        <MobileTab itemKey="trips" />
        <MoreTab />
      </nav>
      <span className="sr-only">{t.brand.slogan}</span>
    </div>
  );
}
