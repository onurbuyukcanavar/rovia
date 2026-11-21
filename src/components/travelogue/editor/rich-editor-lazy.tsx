"use client";
import dynamic from "next/dynamic";
import type { RichEditorProps } from "./rich-editor";

/**
 * TipTap/ProseMirror (≈110 KB gzip) yalnızca düzenleyici gösterildiğinde yüklenir.
 * İskelet, gerçek düzenleyicinin kutusuyla aynı boyuttadır (araç çubuğu + gövde + sayaç) → yerleşim kayması yok.
 */
function EditorSkeleton({ minimal }: { minimal: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-raised" aria-busy="true">
      <div className="h-[3.25rem] border-b border-line sm:h-12" />
      <div className={minimal ? "min-h-28 px-4 py-4 sm:px-6" : "min-h-64 px-4 py-4 sm:px-6"}>
        <div className="h-4 w-2/3 animate-pulse rounded bg-sunken" />
      </div>
      <div className="h-[1.9rem] border-t border-line" />
    </div>
  );
}

const load = () => import("./rich-editor").then((m) => m.RichEditor);
const FullEditor = dynamic(load, { ssr: false, loading: () => <EditorSkeleton minimal={false} /> });
const MinimalEditor = dynamic(load, { ssr: false, loading: () => <EditorSkeleton minimal /> });

export function RichEditor(props: RichEditorProps) {
  return props.minimal ? <MinimalEditor {...props} /> : <FullEditor {...props} />;
}
