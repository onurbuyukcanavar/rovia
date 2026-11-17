"use client";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/**
 * Yerel <dialog> tabanlı pencere: odak tuzağı, Esc ile kapanma ve arka plan erişilemezliği tarayıcıdan gelir.
 * Telefonda alttan açılan sayfa, masaüstünde ortada kart.
 */
export function Modal({ open, onClose, title, children, className, testId }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string; testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
    // Next 16 önceki sayfayı gizli (Activity) tutar: açık kalan modal <dialog> yeni sayfayı
    // etkileşimsiz (inert) bırakır. Gizlenince/ayrılınca kapat .
    return () => {
      if (d.open) d.close();
    };
  }, [open]);

  return (
    <dialog ref={ref} aria-labelledby={titleId} data-testid={testId}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cn(
        "m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border border-sand-200 bg-paper p-0 text-ink-900 shadow-xl backdrop:bg-ink-950/50",
        "sm:m-auto sm:max-w-lg sm:rounded-3xl",
        className,
      )}>
      {open && (
        <div className="space-y-4 px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t.common.close}
              className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-full hover:bg-sand-100">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
