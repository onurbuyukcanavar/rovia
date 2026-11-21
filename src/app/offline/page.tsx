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
    // Temayı kök düzendeki satır içi tema betiği belirler (önbellekteki kopyada da çalışır; JS parçası gerekmez)
    <main id="icerik" data-themed className="page-backdrop grid min-h-dvh place-items-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-fg">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center"><Logo /></div>
        <span className="mx-auto mt-12 grid size-16 place-items-center rounded-3xl border border-line bg-raised text-accent-ink shadow-[var(--shadow-card)]">
          <WifiOff className="size-7" aria-hidden />
        </span>
        <h1 className="mt-7 text-[2.6rem] leading-[1.04] font-extralight tracking-[-0.03em]">{m.title}</h1>
        <p className="mt-3 leading-relaxed text-fg-muted">{m.body}</p>
        <a href="" className={buttonClass("primary", "lg", "mt-8 w-full")}>
          <RotateCw className="size-4" aria-hidden /> {m.retry}
        </a>
        <p className="mt-6 rounded-2xl border border-line bg-sunken p-4 text-left text-sm leading-relaxed text-fg-muted">{m.recording}</p>
      </div>
    </main>
  );
}
