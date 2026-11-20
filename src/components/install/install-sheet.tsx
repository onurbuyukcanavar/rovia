"use client";
import Link from "next/link";
import { Compass, Download, EllipsisVertical, Share, SquarePlus, Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Modal } from "@/components/travelogue/workspace/modal";
import { Button, buttonClass } from "@/components/ui/button";
import { ANDROID_APK_URL } from "@/lib/platform";
import { t } from "@/i18n";
import { promptInstall, sheetVariant } from "./install-store";
import { useInstallState } from "./use-install-state";

const m = t.install;

/** "ROVIA'yı telefonuna yükle" penceresi — tetikleyici tarafından tembel (lazy) yüklenir. */
export default function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useInstallState();
  const variant = sheetVariant(s.os, s.canPrompt);
  const [busy, setBusy] = useState(false);

  async function install() {
    setBusy(true);
    try {
      if (await promptInstall()) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={m.sheetTitle} testId="install-sheet">
      {(variant === "android-prompt" || variant === "android-menu") && (
        <>
          <p className="text-stone-700">{m.android.intro}</p>
          {variant === "android-prompt" ? (
            <Button variant="primary" size="lg" className="w-full" onClick={install} disabled={busy}>
              <SquarePlus className="size-5" aria-hidden /> {m.android.prompt}
            </Button>
          ) : (
            <Steps title={m.android.menuTitle} items={[
              [<EllipsisVertical key="i" />, m.android.menuSteps[0]],
              [<SquarePlus key="i" />, m.android.menuSteps[1]],
              [<Check key="i" />, m.android.menuSteps[2]],
            ]} />
          )}
          <div className="rounded-2xl border border-sand-200 bg-sand-100/50 p-4">
            <a href={ANDROID_APK_URL} rel="noopener" className={buttonClass("secondary", "md", "w-full")}>
              <Download className="size-4" aria-hidden /> {m.android.apk}
            </a>
            <p className="mt-2 text-sm text-stone-600">{m.android.apkNote}</p>
          </div>
        </>
      )}

      {variant === "ios" && (
        <>
          <p className="text-stone-700">{m.ios.intro}</p>
          {s.iosNonSafari && <p role="note" className="rounded-2xl bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900">{m.ios.notSafari}</p>}
          <Steps items={[
            [<Compass key="i" />, m.ios.steps[0]],
            [<Share key="i" />, m.ios.steps[1]],
            [<SquarePlus key="i" />, m.ios.steps[2]],
            [<Check key="i" />, m.ios.steps[3]],
          ]} />
        </>
      )}

      {(variant === "desktop" || variant === "desktop-prompt") && (
        <>
          <p className="text-stone-700">{m.desktop.intro}</p>
          {variant === "desktop-prompt" && (
            <Button variant="primary" className="w-full" onClick={install} disabled={busy}>
              <Download className="size-4" aria-hidden /> {m.desktop.prompt}
            </Button>
          )}
          <Link href="/indir" onClick={onClose} className="inline-block font-semibold text-amber-700 underline-offset-2 hover:underline">
            {m.desktop.more} →
          </Link>
        </>
      )}
    </Modal>
  );
}

function Steps({ title, items }: { title?: string; items: [ReactNode, string][] }) {
  return (
    <div>
      {title && <p className="mb-2 text-sm font-bold">{title}</p>}
      <ol className="space-y-2">
        {items.map(([icon, text], i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink-900 text-paper [&>svg]:size-4.5" aria-hidden>{icon}</span>
            <span className="text-[0.95rem]"><span className="font-bold tabular-nums text-stone-500">{i + 1}.</span> {text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
