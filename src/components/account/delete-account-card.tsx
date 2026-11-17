"use client";
import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { Modal } from "@/components/travelogue/workspace/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  clearLocalRoviaData, DELETE_CONFIRM_PHRASE, DELETED_REDIRECT, normalizeConfirm, type DeleteErrorCode,
} from "@/lib/account/delete";
import { deleteMediaBatch, finalizeAccountDeletion, prepareAccountDeletion, signOutForReauth } from "@/lib/actions/account";
import { t } from "@/i18n";

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "media"; done: number; total: number }
  | { kind: "account" }
  | { kind: "done" }
  | { kind: "reauth" }
  | { kind: "error"; code: DeleteErrorCode | "network" };

const m = t.account.delete;

function errorText(code: DeleteErrorCode | "network"): string {
  switch (code) {
    case "confirm": return m.errors.confirm;
    case "media_remaining": return m.errors.mediaRemaining;
    case "media": return m.errors.media;
    case "network": return m.errors.network;
    default: return m.errors.failed;
  }
}

/** Tehlikeli bölge: onay penceresi → oturum tazeliği → fotoğrafları 100'erli sil → account_delete → çıkış. */
export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputId = useId();
  const busy = phase.kind === "checking" || phase.kind === "media" || phase.kind === "account" || phase.kind === "done";
  const matches = normalizeConfirm(text) !== null;

  function close() {
    if (busy) return; // işlem yarıda bırakılamaz
    setOpen(false);
    setText("");
    setPhase({ kind: "idle" });
  }

  async function run() {
    if (!matches || busy) return;
    const confirm = text;
    const stop = (code: DeleteErrorCode) => setPhase(code === "reauth_required" ? { kind: "reauth" } : { kind: "error", code });
    try {
      setPhase({ kind: "checking" });
      const prep = await prepareAccountDeletion(confirm);
      if (prep.status === "error") return stop(prep.code);

      let done = 0;
      const total = prep.mediaCount;
      setPhase({ kind: "media", done, total });
      for (let guard = 0; guard < 10_000; guard++) {
        const batch = await deleteMediaBatch(confirm);
        if (batch.status === "error") return stop(batch.code);
        if (batch.done) break;
        done += batch.removed;
        setPhase({ kind: "media", done, total: Math.max(total, done) });
      }

      setPhase({ kind: "account" });
      const fin = await finalizeAccountDeletion(confirm);
      if (fin.status === "error") return stop(fin.code);

      setPhase({ kind: "done" });
      try {
        clearLocalRoviaData(window.localStorage);
        window.indexedDB?.deleteDatabase("rovia-gps");
      } catch {
        // Tarayıcı depolaması kapalıysa yapılacak bir şey yok
      }
      window.location.replace(DELETED_REDIRECT);
    } catch {
      setPhase({ kind: "error", code: "network" });
    }
  }

  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 p-4" data-testid="account-delete">
      <h3 className="flex items-center gap-2 font-semibold text-danger"><TriangleAlert className="size-4" aria-hidden /> {m.title}</h3>
      <p className="mt-1 text-sm text-stone-700">{m.body}</p>
      <Button type="button" variant="danger" size="sm" className="mt-4" onClick={() => setOpen(true)}>{m.open}</Button>

      <Modal open={open} onClose={close} title={m.dialogTitle} testId="account-delete-dialog">
        {phase.kind === "reauth" ? (
          <div className="space-y-4">
            <Alert tone="error"><strong>{m.reauth.title}.</strong> {m.reauth.body}</Alert>
            <form action={signOutForReauth}>
              <SubmitButton variant="primary">{m.reauth.button}</SubmitButton>
            </form>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <p className="text-sm text-stone-700">{m.intro}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700">
              {m.items.map((it) => <li key={it}>{it}</li>)}
            </ul>
            <Alert tone="error">{m.irreversible}</Alert>
            <p className="text-xs text-stone-600">{m.reauthNote}</p>
            <div className="space-y-1.5">
              <label htmlFor={inputId} className="block text-sm font-semibold text-ink-800">{m.confirmLabel(DELETE_CONFIRM_PHRASE)}</label>
              <input id={inputId} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
                autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={DELETE_CONFIRM_PHRASE}
                className="h-12 w-full rounded-xl border border-sand-300 bg-white px-4 text-[0.95rem] outline-none focus:border-ink-700 focus:ring-4 focus:ring-amber-400/25" />
            </div>

            <div role="status" aria-live="polite" className="text-sm font-semibold text-ink-800">
              {phase.kind === "checking" && m.steps.checking}
              {phase.kind === "media" && m.steps.media(phase.done, phase.total)}
              {phase.kind === "account" && m.steps.account}
              {phase.kind === "done" && m.steps.done}
            </div>
            {phase.kind === "media" && phase.total > 0 && (
              <progress className="h-2 w-full accent-danger" max={phase.total} value={phase.done} />
            )}
            {phase.kind === "error" && <Alert tone="error">{errorText(phase.code)}</Alert>}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={busy}>{m.cancel}</Button>
              <Button type="submit" variant="danger" disabled={!matches || busy} className="border-danger! bg-danger! text-paper! hover:bg-danger/90!">
                {phase.kind === "error" ? m.errors.retry : m.submit}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
