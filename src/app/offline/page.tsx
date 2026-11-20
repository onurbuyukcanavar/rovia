import type { Metadata } from "next";
import { RotateCw, WifiOff } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/i18n";

export const metadata: Metadata = { title: t.install.offline.title, robots: { index: false, follow: false } };

/**
 * Çevrimdışı ekranı: servis çalışanı (public/sw.js) bu sayfayı önbelleğe alır ve ağ yokken
 * istenen adreste gösterir. Tamamen statiktir ve JS olmadan çalışır (JS parçaları önbellekte değildir):
 * "Tekrar dene" boş href ile bulunulan adresi yeniden yükler.
 */
export default function OfflinePage() {
  const m = t.install.offline;
  return (
    <main id="icerik" className="grid min-h-dvh place-items-center bg-paper px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center"><Logo /></div>
        <span className="mx-auto mt-10 grid size-16 place-items-center rounded-3xl bg-ink-900 text-amber-400">
          <WifiOff className="size-8" aria-hidden />
        </span>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{m.title}</h1>
        <p className="mt-3 leading-relaxed text-stone-700">{m.body}</p>
        <a href="" className={buttonClass("primary", "lg", "mt-8 w-full")}>
          <RotateCw className="size-4" aria-hidden /> {m.retry}
        </a>
        <p className="mt-6 rounded-2xl border border-sand-200 bg-sand-100/50 p-4 text-left text-sm leading-relaxed text-stone-600">{m.recording}</p>
      </div>
    </main>
  );
}
