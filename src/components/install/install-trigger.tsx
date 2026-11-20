"use client";
import { ChevronRight, Smartphone } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { t } from "@/i18n";
import { showHeaderButton } from "./install-store";
import { useInstallState } from "./use-install-state";

// Pencere ilk dokunuşta yüklenir: ilk yükleme JS'ine yalnızca bu küçük tetikleyici girer
const InstallSheet = lazy(() => import("./install-sheet"));

function useSheet() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const sheet = mounted ? (
    <Suspense fallback={null}><InstallSheet open={open} onClose={() => setOpen(false)} /></Suspense>
  ) : null;
  return { sheet, show: () => { setMounted(true); setOpen(true); } };
}

/** Mobil üst çubuk: yalnızca telefonda ve yüklenmemişken görünen simge düğmesi */
export function InstallHeaderButton() {
  const s = useInstallState();
  const { sheet, show } = useSheet();
  if (!showHeaderButton(s)) return null;
  return (
    <>
      <button type="button" onClick={show} aria-label={t.install.trigger} title={t.install.trigger}
        className="grid size-10 place-items-center rounded-full text-ink-800 hover:bg-sand-100 active:bg-sand-200">
        <Smartphone className="size-5" aria-hidden />
      </button>
      {sheet}
    </>
  );
}

/** "Diğer" listesindeki satır (her cihazda; yüklüyse ya da Android uygulamasındaysa gizli) */
export function InstallListRow() {
  const s = useInstallState();
  const { sheet, show } = useSheet();
  if (!s.ready || s.installed) return null;
  return (
    <li>
      <button type="button" onClick={show} className="flex min-h-14 w-full items-center gap-4 px-4 text-left hover:bg-sand-100/60">
        <Smartphone className="size-5 text-ink-700" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold">{t.install.trigger}</span>
          <span className="block text-sm text-stone-600">{t.install.triggerHint}</span>
        </span>
        <ChevronRight className="size-4 text-stone-500" aria-hidden />
      </button>
      {sheet}
    </li>
  );
}
