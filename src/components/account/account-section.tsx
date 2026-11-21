import { UserRoundCog } from "lucide-react";
import { DataExportCard } from "./data-export-card";
import { DeleteAccountCard } from "./delete-account-card";
import { t } from "@/i18n";

/** Ayarlar › "Hesap ve veriler" (KVKK m. 11: veri kopyası ve silme). */
export function AccountSection() {
  return (
    <section id="hesap" className="card scroll-mt-24 p-5 sm:p-6" data-testid="settings-account">
      <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-fg"><UserRoundCog className="size-5 shrink-0 text-accent-ink" aria-hidden /> {t.account.title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t.account.body}</p>
      <div className="mt-5 space-y-4">
        <DataExportCard />
        <DeleteAccountCard />
      </div>
    </section>
  );
}
