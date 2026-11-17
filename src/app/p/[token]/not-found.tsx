import { LogoMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/i18n";

const P = t.share.page;

export default function ShareNotFound() {
  return (
    <main id="icerik" className="grid min-h-[70dvh] place-items-center px-6 text-center" data-testid="share-unavailable">
      <div>
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{P.unavailableTitle}</h1>
        <p className="mt-2 text-stone-600">{P.unavailableBody}</p>
        <ButtonLink href="/" className="mt-8">{P.home}</ButtonLink>
      </div>
    </main>
  );
}
