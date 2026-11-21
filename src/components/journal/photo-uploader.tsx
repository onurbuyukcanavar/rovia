"use client";
import { AlertCircle, Check, ImagePlus, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { useUploader } from "@/lib/media/use-uploader";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

type Props = {
  userId: string;
  tripId: string | null;
  /** Yüklenen fotoğrafların kimlikleri (ör. not düzenleyicide otomatik seçmek için) */
  onUploaded?: (ids: string[]) => void;
  compact?: boolean;
};

export function PhotoUploader({ userId, tripId, onUploaded, compact = false }: Props) {
  const inputId = useId();
  const { items, busy, add, clear } = useUploader({ userId, tripId, onUploaded });
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const skipped = add(files);
    setNotice(skipped > 0 ? t.journal.upload.tooMany(skipped) : null);
  }

  const finished = items.length > 0 && items.every((i) => i.status === "done" || i.status === "error");

  return (
    <div className="space-y-3" data-testid="photo-uploader">
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed text-fg transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent/25",
          compact ? "px-4 py-3" : "flex-col px-6 py-6 text-center",
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-raised hover:border-fg-subtle",
        )}
      >
        {busy ? <LoaderCircle className="size-6 shrink-0 animate-spin text-accent-ink" aria-hidden /> : <ImagePlus className="size-6 shrink-0 text-accent-ink" aria-hidden />}
        <span className={cn("font-semibold", compact && "text-sm")}>{compact ? t.journal.upload.button : t.journal.upload.drop}</span>
        {!compact && <span className="text-xs text-fg-muted">{t.journal.upload.hint}</span>}
        <input id={inputId} type="file" multiple accept="image/*,.heic,.heif" className="sr-only"
          data-testid="photo-input"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </label>
      {compact && <p className="text-xs text-fg-muted">{t.journal.upload.hint}</p>}
      {notice && <Alert>{notice}</Alert>}

      {items.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-live="polite" data-testid="upload-list">
          {items.map((it) => (
            <li key={it.key} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-sunken" title={it.error ?? it.name}
              data-status={it.status}>
              {it.preview && (
                // eslint-disable-next-line @next/next/no-img-element -- yerel önizleme (blob URL)
                <img src={it.preview} alt="" className="size-full object-cover" />
              )}
              <span className={cn(
                "absolute inset-x-1 bottom-1 flex items-center justify-center gap-1 rounded-md px-1 py-0.5 text-[0.62rem] font-semibold",
                it.status === "error" ? "bg-danger text-surface" : it.status === "done" ? "bg-success text-surface" : "bg-surface/90 text-fg",
              )}>
                {it.status === "done" ? <Check className="size-3" aria-hidden /> : it.status === "error" ? <AlertCircle className="size-3" aria-hidden />
                  : <LoaderCircle className="size-3 animate-spin" aria-hidden />}
                {t.journal.upload.status[it.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {items.some((i) => i.status === "error") && (
        <ul className="space-y-1 text-xs text-danger">
          {items.filter((i) => i.status === "error").map((i) => <li key={i.key}>{i.name}: {i.error}</li>)}
        </ul>
      )}
      {finished && (
        <button type="button" onClick={clear} className="text-xs font-semibold text-fg-muted underline">{t.journal.upload.clear}</button>
      )}
    </div>
  );
}
