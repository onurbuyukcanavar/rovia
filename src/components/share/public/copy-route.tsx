"use client";
import { CopyPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { copySharedRoute } from "@/lib/actions/share";
import { t } from "@/i18n";

const P = t.share.page;

/** "Bu rotayı planıma kopyala": oturum varsa sunucu eylemi (başarılıysa planlayıcıya yönlendirir), yoksa giriş. */
export function CopyRoute({ token, signedIn }: { token: string; signedIn: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!signedIn) {
    return (
      <ButtonLink href={`/giris?next=${encodeURIComponent(`/p/${token}`)}`} variant="accent" data-testid="share-copy-login">
        <CopyPlus className="size-4" aria-hidden /> {P.copyLogin}
      </ButtonLink>
    );
  }
  return (
    <div className="space-y-2">
      <Button type="button" variant="accent" disabled={pending} data-testid="share-copy-route"
        onClick={() => start(async () => {
          setError(null);
          const r = await copySharedRoute(token);
          if (r && !r.ok) setError(r.message);
        })}>
        <CopyPlus className="size-4" aria-hidden /> {pending ? P.copying : P.copy}
      </Button>
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}
