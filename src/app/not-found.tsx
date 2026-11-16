import { LogoMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="icerik" className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <LogoMark className="mx-auto size-14" />
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Bu yol bir yere çıkmıyor.</h1>
        <p className="mt-2 text-stone-600">Aradığın sayfa bulunamadı ya da taşınmış olabilir.</p>
        <ButtonLink href="/" className="mt-8">Ana sayfaya dön</ButtonLink>
      </div>
    </main>
  );
}
