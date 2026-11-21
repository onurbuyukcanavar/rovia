import { REQUIRED_ENV_VARS } from "@/lib/env";
import { t } from "@/i18n";
import { Alert } from "@/components/ui/alert";

/** Supabase yapılandırılmamışsa sahte form göstermek yerine ne gerektiğini açıkça anlatır. */
export function SetupNotice() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t.setup.title}</h1>
      <Alert tone="info">{t.setup.body}</Alert>
      <pre className="overflow-x-auto rounded-xl bg-ink-900 p-4 text-xs leading-6 text-paper">
        {REQUIRED_ENV_VARS.map((v) => `${v.name}=${v.example}`).join("\n")}
      </pre>
      <p className="text-sm text-fg-muted">Ayrıntılı kurulum: docs/SETUP.md</p>
    </div>
  );
}
