import type { Metadata } from "next";
import { Suspense } from "react";
import { CarFront, KeyRound, Mail, MapPinned, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { GpsRetentionForm } from "@/components/settings/gps-retention-form";
import { NewPasswordForm } from "@/components/auth/reset-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { linkGoogle, unlinkGoogle } from "@/lib/actions/settings";
import { signOut } from "@/lib/actions/auth";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.settings.title };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

const MESSAGES: Record<string, { tone: "error" | "success"; text: string }> = {
  "linked:google": { tone: "success", text: "Google hesabın bağlandı." },
  "unlinked:google": { tone: "success", text: "Google bağlantısı kaldırıldı." },
  "error:google_disabled": { tone: "error", text: t.auth.googleDisabled },
  "error:link": { tone: "error", text: "Google hesabı bağlanamadı. Bu Google hesabı başka bir ROVIA hesabına bağlı olabilir." },
  "error:unlink": { tone: "error", text: "Google bağlantısı kaldırılamadı. Lütfen tekrar dene." },
  "error:last_identity": { tone: "error", text: t.settings.lastMethodWarning },
};

export default function SettingsPage({ searchParams }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t.nav.settings} title={t.settings.title} />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-sand-100" />}>
        <SettingsBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsBody({ searchParams }: Props) {
  const user = await requireUser();
  const params = await searchParams;
  const flashKey = Object.entries(params).map(([k, v]) => `${k}:${v}`).find((k) => k in MESSAGES);
  const flash = flashKey ? MESSAGES[flashKey] : null;

  const supabase = await createClient();
  const [{ data: idData, error: idError }, { data: settings }] = await Promise.all([
    supabase.auth.getUserIdentities(),
    supabase.from("user_settings").select("gps_raw_retention_days").eq("user_id", user.id).maybeSingle(),
  ]);
  if (idError) console.error("[rovia] Kimlikler okunamadı:", idError.code);
  const identities = idData?.identities ?? [];
  const google = identities.find((i) => i.provider === "google");
  const hasEmail = identities.some((i) => i.provider === "email");
  const googleEmail = typeof google?.identity_data?.email === "string" ? google.identity_data.email : null;

  return (
    <>
      {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}

      <section className="card p-6">
        <h2 className="text-lg font-bold">{t.settings.profile}</h2>
        <p className="mt-1 text-sm text-stone-600">{t.settings.profileBody}</p>
        <div className="mt-5"><ProfileForm fullName={user.fullName} username={user.username} /></div>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-bold">{t.settings.accounts}</h2>
        <p className="mt-1 text-sm text-stone-600">{t.settings.accountsBody}</p>
        <ul className="mt-5 divide-y divide-sand-200 rounded-xl border border-sand-200">
          <li className="flex flex-wrap items-center gap-3 p-4">
            <Mail className="size-5 text-stone-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.settings.emailPassword}</p>
              <p className="truncate text-sm text-stone-600">{user.email}</p>
            </div>
            <Badge className={hasEmail ? "bg-success/10 text-success" : undefined}>
              {hasEmail ? t.settings.googleConnected : t.settings.googleNotConnected}
            </Badge>
          </li>
          <li className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-5 place-items-center text-sm font-black text-[#4285F4]" aria-hidden>G</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Google</p>
              <p className="truncate text-sm text-stone-600">{google ? (googleEmail ?? t.settings.googleConnected) : t.settings.googleNotConnected}</p>
            </div>
            {google ? (
              <form action={unlinkGoogle}>
                <SubmitButton variant="secondary" size="sm" disabled={identities.length < 2}>{t.settings.disconnect}</SubmitButton>
              </form>
            ) : (
              <form action={linkGoogle}>
                <SubmitButton variant="secondary" size="sm">{t.settings.connect}</SubmitButton>
              </form>
            )}
          </li>
        </ul>
        {google && identities.length < 2 && <Alert className="mt-4">{t.settings.lastMethodWarning}</Alert>}
        <p className="mt-4 text-xs leading-relaxed text-stone-600">{t.settings.googleScopeNote}</p>
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="size-5" aria-hidden /> {t.settings.security}</h2>
        <div className="mt-5 max-w-sm">
          <NewPasswordForm submitLabel={hasEmail ? t.settings.changePassword : t.settings.setPassword} onDoneHref={null} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><MapPinned className="size-5" aria-hidden /> {t.gpsSettings.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">{t.gpsSettings.body}</p>
        <div className="mt-5"><GpsRetentionForm days={settings ? settings.gps_raw_retention_days : 90} /></div>
        <p className="mt-4 text-xs text-stone-500">{t.gpsSettings.perTrip}</p>
      </section>

      <section className="card p-6" data-testid="settings-garage">
        <h2 className="flex items-center gap-2 text-lg font-bold"><CarFront className="size-5" aria-hidden /> {t.garage.settings.title}</h2>
        <p className="mt-2 text-sm text-stone-600">{t.garage.settings.body}</p>
        <ButtonLink href="/garaj" variant="secondary" size="sm" className="mt-4">{t.garage.settings.open}</ButtonLink>
      </section>

      <section className="card p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="size-5" aria-hidden /> {t.settings.privacy}</h2>
        <p className="mt-2 text-sm text-stone-600">{t.settings.defaultsPrivate}</p>
        <p className="mt-2 text-sm text-stone-600">{t.settings.privacyBody}</p>
      </section>

      <form action={signOut}>
        <SubmitButton variant="danger">{t.nav.signOut}</SubmitButton>
      </form>
    </>
  );
}
