"use client";
import { CircleCheck, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { t } from "@/i18n";

const noop = () => () => {};
const readFlag = () => new URLSearchParams(window.location.search).get("hesap") === "silindi";

/** Anasayfa: hesap silindikten sonra (/?hesap=silindi) tek satırlık bilgi. Statik sayfayı dinamik yapmaz. */
export function AccountDeletedBanner() {
  const flagged = useSyncExternalStore(noop, readFlag, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!flagged || dismissed) return null;
  return (
    <div role="status" data-testid="account-deleted-banner"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-sm text-paper shadow-xl">
      <CircleCheck className="size-5 shrink-0 text-amber-400" aria-hidden />
      <p className="min-w-0 flex-1">{t.account.deletedBanner}</p>
      <button type="button" aria-label={t.common.close} onClick={() => {
        setDismissed(true);
        window.history.replaceState(null, "", window.location.pathname);
      }} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-paper/10">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
