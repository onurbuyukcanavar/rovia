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
import { ThemePicker } from "@/components/theme/theme-picker";
import { SectionEyebrow } from "@/components/ui/section-eyebrow";

export const metadata: Metadata = { title: t.nav.more };

/** Mobilde alt menüye sığmayan tüm bölümler; masaüstündeki sol menünün eşdeğeri. */
export default function MorePage() {
  return (
    <div data-themed className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <PageHeader title={t.nav.more} />
      <ul className="card divide-y divide-line overflow-hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const inner = (
            <>
              <Icon className="size-5 text-accent-ink" aria-hidden />
              <span className="flex-1 font-semibold">{item.label}</span>
              {isAvailable(item) ? <ChevronRight className="size-4 text-fg-subtle" aria-hidden /> : <Badge>{t.common.soon} · {t.common.phase(item.phase)}</Badge>}
            </>
          );
          return (
            <li key={item.key}>
              {isAvailable(item) ? (
                <Link href={item.href} className="flex min-h-14 items-center gap-4 px-4 hover:bg-fg/[0.04]">{inner}</Link>
              ) : (
                <span aria-disabled="true" className="flex min-h-14 items-center gap-4 px-4 opacity-60">{inner}</span>
              )}
            </li>
          );
        })}
        <InstallListRow />
      </ul>
      <section aria-labelledby="diger-gorunum" className="space-y-3">
        <SectionEyebrow as="h2" id="diger-gorunum">{t.theme.title}</SectionEyebrow>
        <ThemePicker compact />
      </section>
      <form action={signOut}><SubmitButton variant="danger" className="w-full">{t.nav.signOut}</SubmitButton></form>
    </div>
  );
}
