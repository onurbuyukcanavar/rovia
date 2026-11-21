"use client";
import { Download } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { exportFileName } from "@/lib/account/export";
import { t } from "@/i18n";

type State = { status: "idle" | "pending" | "done" } | { status: "error"; message: string };

/** "Verilerimi indir": JSON dosyasını indirir; hata durumunda sayfadan ayrılmadan Türkçe mesaj gösterir. */
export function DataExportCard() {
  const [state, setState] = useState<State>({ status: "idle" });
  const m = t.account.export;

  async function download() {
    setState({ status: "pending" });
    let res: Response;
    try {
      res = await fetch("/api/account/export", { cache: "no-store", credentials: "same-origin" });
    } catch {
      setState({ status: "error", message: m.errors.network });
      return;
    }
    if (!res.ok) {
      setState({ status: "error", message: res.status === 429 ? m.errors.rateLimited : m.errors.failed });
      return;
    }
    try {
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? exportFileName(new Date());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState({ status: "done" });
    } catch {
      setState({ status: "error", message: m.errors.failed });
    }
  }

  return (
    <div className="rounded-xl border border-line p-4" data-testid="account-export">
      <h3 className="font-semibold">{m.title}</h3>
      <p className="mt-1 text-sm text-fg-muted">{m.body}</p>
      <p className="mt-2 text-xs text-fg-subtle">{m.photosNote}</p>
      {state.status === "error" && <Alert tone="error" className="mt-3">{state.message}</Alert>}
      {state.status === "done" && <Alert tone="success" className="mt-3">{m.done}</Alert>}
      <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={download} disabled={state.status === "pending"}>
        <Download className="size-4" aria-hidden /> {state.status === "pending" ? m.pending : m.button}
      </Button>
    </div>
  );
}
