"use client";
import { Check, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PhotoUploader } from "@/components/journal/photo-uploader";
import { Button } from "@/components/ui/button";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const tx = t.travelogue.editor.imageDialog;

/** Fotoğraf seçme/yükleme penceresi (yerel <dialog>, odak yönetimi tarayıcıda). */
export function ImagePicker({
  media, waiting, userId, tripId, onUploaded, onInsert, onClose,
}: {
  media: MediaItem[];
  waiting: readonly string[];
  userId: string;
  tripId: string | null;
  onUploaded: (ids: string[]) => void;
  onInsert: (ids: string[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <dialog
      ref={ref}
      aria-labelledby="rovia-image-picker-title"
      data-testid="image-picker"
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="m-auto max-h-[min(90dvh,48rem)] w-[min(100vw-1.5rem,44rem)] overflow-hidden rounded-[var(--radius-card)] border border-sand-200 bg-paper-50 p-0 text-ink-900 shadow-2xl backdrop:bg-ink-950/50"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <div>
            <h2 id="rovia-image-picker-title" className="font-serif text-xl font-semibold">{tx.title}</h2>
            <p className="mt-0.5 text-sm text-stone-600">{tx.intro}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tx.close} title={tx.close}
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-sand-100">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="eyebrow mb-2">{tx.library}</h3>
            {media.length === 0 && waiting.length === 0 ? (
              <p className="rounded-2xl bg-sand-100 px-4 py-6 text-center text-sm text-stone-600">{tx.empty}</p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {waiting.map((id) => (
                  <li key={id}>
                    <button type="button" onClick={() => toggle(id)} aria-pressed={selected.includes(id)} aria-label={tx.loading}
                      className={cn("relative grid aspect-square w-full place-items-center rounded-xl border-2 bg-sand-100",
                        selected.includes(id) ? "border-amber-500" : "border-transparent")}>
                      <LoaderCircle className="size-5 animate-spin text-amber-600" aria-hidden />
                      {selected.includes(id) && <SelectedMark />}
                    </button>
                  </li>
                ))}
                {media.map((m) => {
                  const on = selected.includes(m.id);
                  const src = m.thumbUrl ?? m.url;
                  return (
                    <li key={m.id}>
                      <button type="button" onClick={() => toggle(m.id)} aria-pressed={on} aria-label={tx.select(m.caption)}
                        data-testid="image-picker-item"
                        className={cn("relative block aspect-square w-full overflow-hidden rounded-xl border-2 bg-sand-100 transition",
                          on ? "border-amber-500 ring-2 ring-amber-300" : "border-transparent hover:border-sand-300")}>
                        {src && (
                          // eslint-disable-next-line @next/next/no-img-element -- imzalı Storage bağlantısı
                          <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                        )}
                        {on && <SelectedMark />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="eyebrow mb-2">{tx.upload}</h3>
            <PhotoUploader userId={userId} tripId={tripId} compact
              onUploaded={(ids) => {
                if (!ids.length) return;
                onUploaded(ids);
                setSelected((s) => [...s, ...ids.filter((id) => !s.includes(id))]);
              }} />
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-sand-200 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose}>{tx.cancel}</Button>
          <Button size="sm" disabled={!selected.length} onClick={() => onInsert(selected)} data-testid="image-picker-insert">
            {tx.insert(selected.length)}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}

function SelectedMark() {
  return (
    <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-amber-500 text-ink-950 shadow">
      <Check className="size-3.5" aria-hidden />
    </span>
  );
}
