"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isAvailable, navItem } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Masaüstü sol menü öğesi. Henüz etkin olmayan fazlar tıklanamaz ve açıkça etiketlenir. */
// Not: Sunucu bileşenlerinden yalnızca anahtar gelir; ikon bileşenleri (fonksiyon) istemci sınırını geçemez.
export function SidebarLink({ itemKey }: { itemKey: string }) {
  const item = navItem(itemKey);
  const pathname = usePathname();
  const Icon = item.icon;
  const available = isAvailable(item);

  if (!available) {
    return (
      <span
        aria-disabled="true"
        title={`${t.common.soon} · ${t.common.phase(item.phase)}`}
        className="flex h-10 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm font-medium text-paper/35"
      >
        <Icon className="size-[18px]" aria-hidden />
        <span className="flex-1 truncate">{item.label}</span>
        <span className="rounded-full border border-paper/15 px-1.5 py-px text-[0.6rem] font-semibold tracking-wide">
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
        active ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/5 hover:text-paper",
      )}
    >
      <Icon className={cn("size-[18px]", active && "text-amber-400")} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function MobileTab({ itemKey, emphasized = false }: { itemKey: string; emphasized?: boolean }) {
  const item = navItem(itemKey);
  const label = item.shortLabel ?? item.label;
  const pathname = usePathname();
  const Icon = item.icon;
  const available = isAvailable(item);
  const active = available && isActive(pathname, item.href);

  const content = emphasized ? (
    <span className="flex flex-col items-center gap-1">
      <span className={cn(
        "-mt-6 grid size-14 place-items-center rounded-full shadow-lg ring-4 ring-paper",
        available ? "bg-amber-500 text-ink-950" : "bg-sand-200 text-stone-500",
      )}>
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="text-[0.68rem] font-semibold">{label}</span>
    </span>
  ) : (
    <span className="flex flex-col items-center gap-1">
      <Icon className={cn("size-[22px]", active && "text-amber-600")} aria-hidden />
      <span className="text-[0.68rem] font-semibold">{label}</span>
    </span>
  );

  const cls = cn(
    "flex min-h-14 flex-1 items-center justify-center",
    active ? "text-ink-900" : available ? "text-stone-600" : "text-stone-500/60",
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

export function MoreTab() {
  const pathname = usePathname();
  const active = isActive(pathname, "/diger") || isActive(pathname, "/ayarlar");
  return (
    <Link href="/diger" aria-current={active ? "page" : undefined}
      className={cn("flex min-h-14 flex-1 items-center justify-center", active ? "text-ink-900" : "text-stone-600")}>
      <span className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 24 24" className={cn("size-[22px]", active && "text-amber-600")} aria-hidden fill="currentColor">
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
        </svg>
        <span className="text-[0.68rem] font-semibold">{t.nav.more}</span>
      </span>
    </Link>
  );
}
