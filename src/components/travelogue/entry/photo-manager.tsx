"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı küçük görseller */
import { ArrowDown, ArrowUp, Check, Images, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PhotoUploader } from "@/components/journal/photo-uploader";
import { fieldClass } from "@/components/journal/note-editor";
import { Modal } from "@/components/travelogue/workspace/modal";
import { setEntryPhotos } from "@/lib/actions/travelogue";
import type { EntryPhoto } from "@/lib/travelogue/types";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.travelogue.pages.entry;
const DELAY = 900;

type SaveState = "idle" | "saving" | "saved" | "error";

/** Yazının fotoğrafları: sıra, yazıya özel açıklama, çıkarma; yolculuk fotoğraflarından seçme ve yeni yükleme. */
export function PhotoManager({ entryId, initial, media, userId, tripId }: {
  entryId: string; initial: EntryPhoto[]; media: MediaItem[]; userId: string; tripId: string | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<EntryPhoto[]>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<EntryPhoto[] | null>(null);
  const byId = new Map(media.map((m) => [m.id, m]));

  async function send(list: EntryPhoto[]) {
    pending.current = null;
    setState("saving");
    setError(null);
    const r = await setEntryPhotos(entryId, list.map((i) => ({ mediaId: i.mediaId, caption: i.caption?.trim() || null })));
    if (r.ok) setState("saved");
    else { setState("error"); setError(r.message); }
    return r.ok;
  }

  function commit(next: EntryPhoto[], immediate = false) {
    setItems(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    if (immediate) return send(next);
    timer.current = setTimeout(() => { timer.current = null; void send(next); }, DELAY);
    return Promise.resolve(true);
  }

  // Sayfadan ayrılırken bekleyen değişikliği gönder
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) void setEntryPhotos(entryId, pending.current.map((i) => ({ mediaId: i.mediaId, caption: i.caption?.trim() || null })));
  }, [entryId]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    void commit(next);
  };

  const available = media.filter((m) => !items.some((i) => i.mediaId === m.id));

  return (
    <section aria-labelledby="entry-photos" className="space-y-3" data-testid="entry-photos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="entry-photos" className="text-lg font-extrabold tracking-tight">{T.photos}</h2>
        <span className="text-xs text-stone-600" role="status">
          {state === "saving" ? T.photosSaving : state === "saved" ? T.photosSaved : ""}
        </span>
      </div>

      {items.length === 0 ? <p className="text-sm text-stone-600">{T.photosEmpty}</p> : (
        <ol className="space-y-2">
          {items.map((it, i) => {
            const m = byId.get(it.mediaId);
            return (
              <li key={it.mediaId} className="flex gap-3 rounded-2xl border border-sand-200 bg-white p-2" data-testid="entry-photo">
                <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-sand-100">
                  {m?.thumbUrl ? <img src={m.thumbUrl} alt={it.caption ?? m.caption ?? ""} className="size-full object-cover" loading="lazy" />
                    : <LoaderCircle className="size-5 animate-spin text-stone-400" aria-label={T.photoLoading} />}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <label htmlFor={`cap-${it.mediaId}`} className="text-xs font-semibold text-stone-600">{T.photoCaption}</label>
                  <textarea id={`cap-${it.mediaId}`} rows={2} maxLength={2000} className={cn(fieldClass, "py-1.5 text-sm")}
                    value={it.caption ?? ""} placeholder={m?.caption ?? undefined}
                    onChange={(e) => void commit(items.map((x) => (x.mediaId === it.mediaId ? { ...x, caption: e.target.value } : x)))} />
                </div>
                <div className="flex shrink-0 flex-col">
                  <IconBtn label={T.photoUp} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconBtn>
                  <IconBtn label={T.photoDown} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconBtn>
                  <IconBtn label={T.photoRemove} onClick={() => void commit(items.filter((x) => x.mediaId !== it.mediaId))}><X className="size-4" /></IconBtn>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setPicking(true)}>
          <Images className="size-4" aria-hidden /> {T.photoPick}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setUploading((v) => !v)} aria-expanded={uploading} data-testid="entry-photo-upload">{T.photoUpload}</Button>
      </div>
      {uploading && (
        <PhotoUploader userId={userId} tripId={tripId} compact onUploaded={(ids) => {
          const fresh = ids.filter((id) => !items.some((x) => x.mediaId === id)).map((id) => ({ mediaId: id, caption: null }));
          if (!fresh.length) return;
          void commit([...items, ...fresh], true).then(() => router.refresh());
        }} />
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title={T.photoPick}>
        <PhotoPicker media={available} onPick={(ids) => {
          setPicking(false);
          if (ids.length) void commit([...items, ...ids.map((id) => ({ mediaId: id, caption: null }))]);
        }} />
      </Modal>
    </section>
  );
}

function PhotoPicker({ media, onPick }: { media: MediaItem[]; onPick: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  if (!media.length) return <p className="text-sm text-stone-600">{T.photoPickEmpty}</p>;
  return (
    <div className="space-y-3">
      <ul className="grid max-h-[50dvh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
        {media.map((m) => {
          const on = selected.includes(m.id);
          return (
            <li key={m.id}>
              <button type="button" aria-pressed={on} aria-label={m.caption || T.photos}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                className={cn("relative block aspect-square w-full overflow-hidden rounded-lg bg-sand-100", on && "ring-4 ring-amber-500")}>
                {m.thumbUrl && <img src={m.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />}
                {on && <Check className="absolute top-1 right-1 size-5 rounded-full bg-amber-500 p-0.5 text-ink-950" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="accent" className="w-full" disabled={!selected.length} onClick={() => onPick(selected)}>
        {T.photoPickDone} ({selected.length})
      </Button>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid size-8 place-items-center rounded-full text-stone-600 hover:bg-sand-100 hover:text-ink-900 disabled:opacity-30">
      <span aria-hidden>{children}</span>
    </button>
  );
}
