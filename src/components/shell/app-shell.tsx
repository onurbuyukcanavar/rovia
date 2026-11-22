import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { MobileNav, MobileNavLive, SidebarNav, SidebarNavLive } from "./nav-link";
import { MobileHeaderAvatar, SidebarUser } from "./user-menu";
import { t } from "@/i18n";
import { InstallHeaderButton } from "@/components/install/install-trigger";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { AccountTheme } from "@/components/theme/account-theme";
import { AppUpdateMount } from "@/components/app-update/app-update-mount";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Hesaptaki tema tercihi (her cihazda aynı tema): dinamik delik, kabuğun statik kısmını bekletmez */}
      <Suspense fallback={null}>
        <AccountTheme />
      </Suspense>
      {/* Masaüstü: sol navigasyon */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-chrome px-4 py-6 lg:flex">
        <div className="flex items-center justify-between gap-2 pr-1">
          <Link href="/panel" className="px-2" aria-label="ROVIA panel">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <nav aria-label="Ana menü" className="scroll-quiet mt-8 flex-1 space-y-0.5 overflow-y-auto">
          <Suspense fallback={<SidebarNav pathname={null} />}>
            <SidebarNavLive />
          </Suspense>
        </nav>
        <Suspense fallback={<div className="h-14 animate-pulse rounded-2xl bg-fg/[0.05]" />}>
          <SidebarUser />
        </Suspense>
      </aside>

      {/* Mobil: üst çubuk (kabuk rengi = tarayıcı tema rengi, src/lib/theme) */}
      {/* Sabit (fixed): kaydırmada ve iOS'ta yerinde kalır; çentik/durum çubuğu payı üstte */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-line bg-chrome pt-[env(safe-area-inset-top)] text-fg backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <Link href="/panel" aria-label="ROVIA panel"><Logo /></Link>
          <div className="flex items-center gap-1.5">
            <InstallHeaderButton />
            <Suspense fallback={<span className="size-8 rounded-full bg-fg/10" />}>
              <MobileHeaderAvatar />
            </Suspense>
          </div>
        </div>
      </header>

      <main id="icerik" className="app-main min-w-0 pt-[var(--mobile-header)] pb-[var(--mobile-nav)] lg:pt-0 lg:pb-0">{children}</main>

      {/* Mobil: alt navigasyon */}
      <nav aria-label="Alt menü"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-chrome pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur lg:hidden">
        <Suspense fallback={<MobileNav pathname={null} />}>
          <MobileNavLive />
        </Suspense>
      </nav>
      {/* Android uygulamasında yeni APK sürümü bildirimi (tarayıcıda hiçbir şey çizmez) */}
      <AppUpdateMount />
      <span className="sr-only">{t.brand.slogan}</span>
    </div>
  );
}
