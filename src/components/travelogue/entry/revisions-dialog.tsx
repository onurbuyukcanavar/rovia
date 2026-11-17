"use client";
import { History, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/travelogue/workspace/modal";
import { listEntryRevisions, restoreEntryRevision, type EntryRevision } from "@/lib/actions/travelogue";
import { formatDate, formatTime } from "@/lib/format";
import { t } from "@/i18n";

const T = t.travelogue.pages.entry;

/** "Önceki sürümler": yazının kayıtlı geçmişi ve geri yükleme. */
export function RevisionsButton({ entryId, beforeRestore, onRestored }: {
  entryId: string; beforeRestore: () => Promise<unknown>; onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<EntryRevision[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [loading, startLoad] = useTransition();
  const [restoring, startRestore] = useTransition();

  function show() {
    setOpen(true);
    setError(null);
    setConfirmId(null);
    startLoad(async () => {
      const r = await listEntryRevisions(entryId);
      if (r.ok) setRevisions(r.revisions);
      else setError(r.message);
    });
  }

  function restore(id: number) {
    setError(null);
    startRestore(async () => {
      await beforeRestore();
      const r = await restoreEntryRevision(entryId, id);
      if (!r.ok) { setError(r.message); return; }
      setOpen(false);
      onRestored();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={show} data-testid="revisions-open">
        <History className="size-4" aria-hidden /> {T.revisions}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={T.revisions} testId="revisions-dialog">
        {loading && !revisions ? (
          <p className="flex items-center gap-2 text-sm text-stone-600"><LoaderCircle className="size-4 animate-spin" aria-hidden /> {t.common.loading}</p>
        ) : revisions && revisions.length === 0 ? (
          <p className="text-sm text-stone-600">{T.revisionsEmpty}</p>
        ) : (
          <ul className="max-h-[60dvh] space-y-2 overflow-y-auto">
            {(revisions ?? []).map((r) => (
              <li key={r.id} className="space-y-1.5 rounded-2xl border border-sand-200 bg-white p-3">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-stone-600">
                  <span className="font-semibold text-ink-800">{T.revisionVersion(r.version)}</span>
                  <span className="tabular-nums">{formatDate(r.createdAt)} · {formatTime(r.createdAt)}</span>
                </p>
                {r.title && <p className="font-semibold">{r.title}</p>}
                {r.preview && <p className="line-clamp-3 text-sm text-stone-700">{r.preview}</p>}
                {confirmId === r.id ? (
                  <div className="space-y-2 rounded-xl bg-sand-100/70 p-2" role="alertdialog" aria-label={T.restoreConfirm}>
                    <p className="text-sm font-semibold">{T.restoreConfirm}</p>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="accent" disabled={restoring} onClick={() => restore(r.id)}>
                        {restoring && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {T.restore}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmId(null)}>{t.common.cancel}</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="text-sm font-semibold text-amber-700 underline" onClick={() => setConfirmId(r.id)}>{T.restore}</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </Modal>
    </>
  );
}
