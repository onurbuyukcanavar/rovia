"use client";
import { Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/travelogue/workspace/modal";
import { getShareSettings, type ShareResult } from "@/lib/actions/share";
import type { ShareKind } from "@/lib/share/types";
import { Alert } from "@/components/ui/alert";
import { t } from "@/i18n";
import { ShareForm } from "./share-form";

const S = t.share;

type Loaded = Extract<ShareResult, { ok: true }>;

/**
 * Paylaş düğmesi + ayarlar penceresi. Durum pencere açılırken sunucudan okunur.
 * disabledReason verilirse (ör. canlı yolculuk) düğme pasif ve açıklamalı gösterilir.
 */
export function ShareButton({ kind, targetId, disabledReason, size = "sm", variant = "secondary", className }: {
  kind: ShareKind; targetId: string; disabledReason?: string;
  size?: "sm" | "md"; variant?: "secondary" | "ghost" | "primary"; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ data: Loaded; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (disabledReason) {
    return (
      <span className="inline-flex flex-col gap-1">
        <Button type="button" size={size} variant={variant} disabled aria-describedby={`share-off-${targetId}`} data-testid="share-button" className={className}>
          <Share2 className="size-4" aria-hidden /> {S.button}
        </Button>
        <span id={`share-off-${targetId}`} className="text-xs text-fg-subtle" data-testid="share-disabled-reason">{disabledReason}</span>
      </span>
    );
  }

  const openDialog = () => {
    setOpen(true);
    setError(null);
    start(async () => {
      const r = await getShareSettings({ kind, id: targetId });
      if (r.ok) setLoaded((prev) => ({ data: r, version: (prev?.version ?? 0) + 1 }));
      else setError(r.message);
    });
  };

  const shared = loaded && loaded.data.state.visibility !== "private";
  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={openDialog} data-testid="share-button" className={className}
        aria-haspopup="dialog">
        <Share2 className="size-4" aria-hidden /> {shared ? S.buttonShared : S.button}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={S.dialogTitle} testId="share-dialog">
        {error && <Alert tone="error">{error}</Alert>}
        {!loaded && !error && <p className="text-sm text-fg-muted" aria-busy>{S.loading}</p>}
        {loaded && (
          <ShareForm key={loaded.version} kind={kind} targetId={targetId} initial={loaded.data} busy={pending}
            onSaved={(r) => setLoaded((prev) => ({ data: r, version: prev?.version ?? 0 }))} />
        )}
      </Modal>
    </>
  );
}
