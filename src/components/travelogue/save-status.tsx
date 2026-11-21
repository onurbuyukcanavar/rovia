"use client";
import { AlertTriangle, Check, CloudOff, History, LoaderCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AutosaveStatus } from "@/lib/travelogue/use-autosave";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const s = t.travelogue.editor.save;

/** useAutosave dönüş değerinin bu bileşenin kullandığı kısmı (her yama tipiyle uyumlu). */
export type AutosaveHandle = {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: string | null;
  backup: unknown;
  flush: () => Promise<boolean>;
  resolveConflict: (choice: "mine" | "theirs") => void;
  restoreBackup: () => void;
  discardBackup: () => void;
};

function formatTime(d: Date) {
  return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function SaveStatus({ autosave, onReload }: { autosave: AutosaveHandle; onReload?: () => void }) {
  const { status, lastSavedAt, error } = autosave;

  let icon = <Check className="size-3.5" aria-hidden />;
  let text: string = s.idle;
  if (status === "saving") {
    icon = <LoaderCircle className="size-3.5 animate-spin" aria-hidden />;
    text = s.saving;
  } else if (status === "dirty") {
    icon = <span className="size-2 rounded-full bg-accent" aria-hidden />;
    text = s.dirty;
  } else if (status === "saved") {
    text = lastSavedAt ? s.saved(formatTime(lastSavedAt)) : s.savedNoTime;
  } else if (status === "error") {
    icon = <AlertTriangle className="size-3.5" aria-hidden />;
    text = s.error;
  } else if (status === "offline") {
    icon = <CloudOff className="size-3.5" aria-hidden />;
    text = s.offline;
  } else if (status === "conflict") {
    icon = <AlertTriangle className="size-3.5" aria-hidden />;
    text = s.conflict;
  } else if (lastSavedAt) {
    text = s.saved(formatTime(lastSavedAt));
  }

  return (
    <div className="space-y-2" data-testid="save-status" data-status={status}>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "flex min-h-6 flex-wrap items-center gap-1.5 text-xs font-medium",
          status === "error" || status === "conflict" ? "text-danger" : status === "offline" ? "text-accent-ink" : "text-fg-muted",
        )}
      >
        {icon}
        <span>{text}</span>
        {status === "error" && (
          <>
            {error && <span className="sr-only">: {error}</span>}
            <span aria-hidden>—</span>
            <button type="button" onClick={() => void autosave.flush()}
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:text-fg"
              title={error ?? undefined}>
              <RotateCw className="size-3" aria-hidden />
              {s.retry}
            </button>
          </>
        )}
      </p>

      {status === "conflict" && (
        <div role="alert" data-testid="save-conflict" className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <AlertTriangle className="size-4" aria-hidden />
            {t.travelogue.editor.conflict.title}
          </p>
          <p className="mt-1 text-fg-muted">{t.travelogue.editor.conflict.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => autosave.resolveConflict("mine")}>{t.travelogue.editor.conflict.mine}</Button>
            <Button size="sm" variant="secondary" onClick={() => { autosave.resolveConflict("theirs"); onReload?.(); }}>
              {t.travelogue.editor.conflict.theirs}
            </Button>
          </div>
        </div>
      )}

      {autosave.backup != null && status !== "conflict" && (
        <div role="alert" data-testid="save-backup" className="rounded-2xl border border-accent/40 bg-accent-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-fg">
            <History className="size-4 text-accent-ink" aria-hidden />
            {t.travelogue.editor.backup.title}
          </p>
          <p className="mt-1 text-fg-muted">{t.travelogue.editor.backup.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="accent" onClick={autosave.restoreBackup}>{t.travelogue.editor.backup.restore}</Button>
            <Button size="sm" variant="ghost" onClick={autosave.discardBackup}>{t.travelogue.editor.backup.discard}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
