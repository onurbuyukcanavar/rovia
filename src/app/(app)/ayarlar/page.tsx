import type { Metadata } from "next";
import { Suspense } from "react";
import { CarFront, KeyRound, Mail, MapPinned, Palette, ShieldCheck, UserRound, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { ProfileForm } from "@/components/settings/profile-form";
import { GpsRetentionForm } from "@/components/settings/gps-retention-form";
import { AccountSection } from "@/components/account/account-section";
import { NewPasswordForm } from "@/components/auth/reset-forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { ThemePicker } from "@/components/theme/theme-picker";
import { cn } from "@/lib/cn";
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
    <div data-themed className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t.nav.settings} title={t.settings.title} />
      <SettingsCard icon={Palette} title={t.theme.title} body={t.theme.body} testId="settings-appearance">
        <ThemePicker />
      </SettingsCard>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[var(--radius-card)] bg-sunken" />}>
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

      <SettingsCard icon={UserRound} title={t.settings.profile} body={t.settings.profileBody}>
        <ProfileForm fullName={user.fullName} username={user.username} />
      </SettingsCard>

      <SettingsCard icon={Link2} title={t.settings.accounts} body={t.settings.accountsBody}>
        <ul className="divide-y divide-line rounded-xl border border-line">
          <li className="flex flex-wrap items-center gap-3 p-4">
            <Mail className="size-5 text-fg-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t.settings.emailPassword}</p>
              <p className="truncate text-sm text-fg-muted">{user.email}</p>
            </div>
            <Badge tone={hasEmail ? "success" : "neutral"}>
              {hasEmail ? t.settings.googleConnected : t.settings.googleNotConnected}
            </Badge>
          </li>
          <li className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-5 place-items-center text-sm font-black text-[#4285F4]" aria-hidden>G</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Google</p>
              <p className="truncate text-sm text-fg-muted">{google ? (googleEmail ?? t.settings.googleConnected) : t.settings.googleNotConnected}</p>
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
        <p className="mt-4 text-xs leading-relaxed text-fg-subtle">{t.settings.googleScopeNote}</p>
      </SettingsCard>

      <SettingsCard icon={KeyRound} title={t.settings.security}>
        <div className="max-w-sm">
          <NewPasswordForm submitLabel={hasEmail ? t.settings.changePassword : t.settings.setPassword} onDoneHref={null} />
        </div>
      </SettingsCard>

      <SettingsCard icon={MapPinned} title={t.gpsSettings.title} body={t.gpsSettings.body}>
        <GpsRetentionForm days={settings ? settings.gps_raw_retention_days : 90} />
        <p className="mt-4 text-xs text-fg-subtle">{t.gpsSettings.perTrip}</p>
      </SettingsCard>

      <SettingsCard icon={CarFront} title={t.garage.settings.title} body={t.garage.settings.body} testId="settings-garage">
        <ButtonLink href="/garaj" variant="secondary" size="sm">{t.garage.settings.open}</ButtonLink>
      </SettingsCard>

      <SettingsCard icon={ShieldCheck} title={t.settings.privacy}>
        <p className="text-sm leading-relaxed text-fg-muted">{t.settings.defaultsPrivate}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">{t.settings.privacyBody}</p>
      </SettingsCard>

      <AccountSection />

      <form action={signOut}>
        <SubmitButton variant="danger">{t.nav.signOut}</SubmitButton>
      </form>
    </>
  );
}

/** Ayar kartı: amber ikonlu başlık, açıklama ve içerik. */
function SettingsCard({ icon: Icon, title, body, children, testId, className }: {
  icon: LucideIcon; title: string; body?: ReactNode; children: ReactNode; testId?: string; className?: string;
}) {
  return (
    <section className={cn("card p-5 sm:p-6", className)} data-testid={testId}>
      <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight text-fg">
        <Icon className="size-5 shrink-0 text-accent-ink" aria-hidden /> {title}
      </h2>
      {body && <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{body}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
