"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isAvailable, navItem } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/** pathname null: ön işleme sırasında (dinamik rotalarda adres henüz bilinmiyor) hiçbir öğe etkin gösterilmez. */
const isActive = (pathname: string | null, href: string) => !!pathname && (pathname === href || pathname.startsWith(`${href}/`));

/** Masaüstü sol menü öğesi. Henüz etkin olmayan fazlar tıklanamaz ve açıkça etiketlenir. */
// Not: Sunucu bileşenlerinden yalnızca anahtar gelir; ikon bileşenleri (fonksiyon) istemci sınırını geçemez.
function SidebarLink({ itemKey, pathname }: { itemKey: string; pathname: string | null }) {
  const item = navItem(itemKey);
  const Icon = item.icon;
  const available = isAvailable(item);

  if (!available) {
    return (
      <span
        aria-disabled="true"
        title={`${t.common.soon} · ${t.common.phase(item.phase)}`}
        className="flex h-10 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-subtle opacity-60"
      >
        <Icon className="size-[18px]" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="rounded-full border border-line-strong px-1.5 py-px text-[0.6rem] font-semibold tracking-wide">
          {t.common.phase(item.phase)}
        </span>
      </span>
    );
  }

  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
        active ? "bg-fg/[0.08] text-fg" : "text-fg-muted hover:bg-fg/[0.05] hover:text-fg",
      )}
    >
      <Icon className={cn("size-[18px]", active && "text-accent-ink")} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function MobileTab({ itemKey, pathname, emphasized = false }: { itemKey: string; pathname: string | null; emphasized?: boolean }) {
  const item = navItem(itemKey);
  const label = item.shortLabel ?? item.label;
  const Icon = item.icon;
  const available = isAvailable(item);
  const active = available && isActive(pathname, item.href);

  const content = emphasized ? (
    <span className="flex flex-col items-center gap-1">
      <span className={cn(
        "-mt-6 grid size-14 place-items-center rounded-full ring-4 ring-surface",
        available ? "bg-accent text-accent-fg shadow-[0_8px_24px_-6px_rgb(232_145_45/0.6)]" : "bg-sunken text-fg-subtle",
      )}>
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="text-[0.68rem] font-semibold">{label}</span>
    </span>
  ) : (
    <span className="flex flex-col items-center gap-1">
      <Icon className={cn("size-[22px]", active && "text-accent-ink")} aria-hidden />
      <span className="text-[0.68rem] font-semibold">{label}</span>
    </span>
  );

  const cls = cn(
    "flex h-14 flex-1 items-center justify-center",
    active ? "text-fg" : available ? "text-fg-muted" : "text-fg-subtle opacity-60",
  );

  if (!available) {
    return (
      <span aria-disabled="true" className={cls} aria-label={`${label} — ${t.common.soon} (${t.common.phase(item.phase)})`}>
        {content}
      </span>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} className={cls}>
      {content}
    </Link>
  );
}

function MoreTab({ pathname }: { pathname: string | null }) {
  const active = isActive(pathname, "/diger") || isActive(pathname, "/ayarlar");
  return (
    <Link href="/diger" aria-current={active ? "page" : undefined}
      className={cn("flex h-14 flex-1 items-center justify-center", active ? "text-fg" : "text-fg-muted")}>
      <span className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 24 24" className={cn("size-[22px]", active && "text-accent-ink")} aria-hidden fill="currentColor">
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
        </svg>
        <span className="text-[0.68rem] font-semibold">{t.nav.more}</span>
      </span>
    </Link>
  );
}

// Not: Adres yalnızca çalışma anında bilinir. Menüler kabukta <Suspense> içinde canlı sürümle
// render edilir; ön işleme (özellikle dinamik rotalar) sırasında etkin öğesiz sürüm gösterilir.

export function SidebarNav({ pathname }: { pathname: string | null }) {
  return NAV_ITEMS.map((item) => <SidebarLink key={item.key} itemKey={item.key} pathname={pathname} />);
}

export function SidebarNavLive() {
  return <SidebarNav pathname={usePathname()} />;
}

export function MobileNav({ pathname }: { pathname: string | null }) {
  return (
    <>
      <MobileTab itemKey="overview" pathname={pathname} />
      <MobileTab itemKey="explore" pathname={pathname} />
      <MobileTab itemKey="record" pathname={pathname} emphasized />
      <MobileTab itemKey="trips" pathname={pathname} />
      <MoreTab pathname={pathname} />
    </>
  );
}

export function MobileNavLive() {
  return <MobileNav pathname={usePathname()} />;
}
