import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { NAV_ITEMS, isAvailable } from "@/config/navigation";
import { signOut } from "@/lib/actions/auth";
import { SubmitButton } from "@/components/ui/submit-button";
import { t } from "@/i18n";
import { InstallListRow } from "@/components/install/install-trigger";

export const metadata: Metadata = { title: t.nav.more };

/** Mobilde alt menüye sığmayan tüm bölümler; masaüstündeki sol menünün eşdeğeri. */
export default function MorePage() {
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <PageHeader title={t.nav.more} />
      <ul className="card divide-y divide-sand-200 overflow-hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const inner = (
            <>
              <Icon className="size-5 text-ink-700" aria-hidden />
              <span className="flex-1 font-semibold">{item.label}</span>
              {isAvailable(item) ? <ChevronRight className="size-4 text-stone-500" aria-hidden /> : <Badge>{t.common.soon} · {t.common.phase(item.phase)}</Badge>}
            </>
          );
          return (
            <li key={item.key}>
              {isAvailable(item) ? (
                <Link href={item.href} className="flex min-h-14 items-center gap-4 px-4 hover:bg-sand-100/60">{inner}</Link>
              ) : (
                <span aria-disabled="true" className="flex min-h-14 items-center gap-4 px-4 opacity-60">{inner}</span>
              )}
            </li>
          );
        })}
        <InstallListRow />
      </ul>
      <form action={signOut}><SubmitButton variant="danger" className="w-full">{t.nav.signOut}</SubmitButton></form>
    </div>
  );
}
