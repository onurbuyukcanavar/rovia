"use client";
import { useRef, useState } from "react";
import { Download, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mapStyleUrl } from "@/lib/env";
import type { Travelogue } from "@/lib/travelogue/types";
import type { PdfProgress } from "@/lib/travelogue/pdf/generate";
import { t } from "@/i18n";

const L = t.travelogue.book;

type State =
  | { kind: "idle" }
  | { kind: "working"; progress: PdfProgress | null }
  | { kind: "done"; skipped: number }
  | { kind: "error" };

function progressLabel(p: PdfProgress | null): string {
  if (!p) return L.pdf.preparing;
  if (p.phase === "photos") return L.pdf.photos(p.done, p.total);
  return p.phase === "map" ? L.pdf.map : L.pdf.building;
}

/** "PDF indir": oluşturucu yalnızca tıklanınca yüklenir; ilerleme ve hata Türkçe gösterilir. */
export function PdfExportButton({ travelogue, styleUrl, className }: { travelogue: Travelogue; styleUrl?: string; className?: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const busy = useRef(false);

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setState({ kind: "working", progress: null });
    try {
      const { generateBookPdf } = await import("@/lib/travelogue/pdf/generate");
      const { blob, fileName, skippedPhotos } = await generateBookPdf(travelogue, {
        styleUrl: styleUrl ?? mapStyleUrl(),
        onProgress: (progress) => setState({ kind: "working", progress }),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState({ kind: "done", skipped: skippedPhotos });
    } catch (e) {
      console.error("[rovia] PDF:", e);
      setState({ kind: "error" });
    } finally {
      busy.current = false;
    }
  }

  const working = state.kind === "working";
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="accent" onClick={run} disabled={working} aria-busy={working} data-testid="pdf-export">
          {working ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : state.kind === "error" ? <RotateCcw className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
          {state.kind === "error" ? L.pdf.retry : L.downloadPdf}
        </Button>
      </div>
      <p className="mt-1 min-h-4 text-right text-xs text-fg-muted" role="status" aria-live="polite">
        {working ? progressLabel(state.progress) : state.kind === "done" ? (state.skipped ? L.pdf.skippedPhotos(state.skipped) : L.pdf.done) : null}
        {state.kind === "error" ? <span className="text-danger">{L.pdf.failed}</span> : null}
      </p>
    </div>
  );
}
