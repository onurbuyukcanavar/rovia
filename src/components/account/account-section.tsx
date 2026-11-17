import { UserRoundCog } from "lucide-react";
import { DataExportCard } from "./data-export-card";
import { DeleteAccountCard } from "./delete-account-card";
import { t } from "@/i18n";

/** Ayarlar › "Hesap ve veriler" (KVKK m. 11: veri kopyası ve silme). */
export function AccountSection() {
  return (
    <section id="hesap" className="card scroll-mt-24 p-6" data-testid="settings-account">
      <h2 className="flex items-center gap-2 text-lg font-bold"><UserRoundCog className="size-5" aria-hidden /> {t.account.title}</h2>
      <p className="mt-2 text-sm text-stone-600">{t.account.body}</p>
      <div className="mt-5 space-y-4">
        <DataExportCard />
        <DeleteAccountCard />
      </div>
    </section>
  );
}
