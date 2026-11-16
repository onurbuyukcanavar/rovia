"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı bağlantılar; Next görsel optimizasyonu kullanılmıyor (kota ve gizlilik) */
import { ChevronLeft, ChevronRight, LoaderCircle, MapPin, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { deleteMedia, updateMediaCaption } from "@/lib/actions/journal";
import type { MediaItem } from "@/lib/journal/types";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/** Kare küçük görsel ızgarası; dokununca tam ekran görüntüleyici açılır. */
export function PhotoGrid({ media, tripId = null, className, label }: { media: MediaItem[]; tripId?: string | null; className?: string; label?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!media.length) return null;
  return (
    <>
      <ul className={cn("grid grid-cols-3 gap-1.5 sm:grid-cols-4", className)} aria-label={label} data-testid="photo-grid">
        {media.map((m, i) => (
          <li key={m.id}>
            <button type="button" onClick={() => setOpen(i)} className="group block aspect-square w-full overflow-hidden rounded-xl bg-sand-100"
              aria-label={m.caption || `${t.journal.lightbox.of(i + 1, media.length)}`}>
              {m.thumbUrl && <img src={m.thumbUrl} alt={m.caption ?? ""} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && media[open] && (
        <Lightbox media={media} index={open} onIndex={setOpen} onClose={() => setOpen(null)} tripId={tripId} />
      )}
    </>
  );
}

function Lightbox({ media, index, onIndex, onClose, tripId }: {
  media: MediaItem[]; index: number; onIndex: (i: number) => void; onClose: () => void; tripId: string | null;
}) {
  const m = media[index];
  const touch = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prev = () => onIndex((index - 1 + media.length) % media.length);
  const next = () => onIndex((index + 1) % media.length);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex((index - 1 + media.length) % media.length);
      else if (e.key === "ArrowRight") onIndex((index + 1) % media.length);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, media.length, onClose, onIndex]);

  return (
    <div role="dialog" aria-modal="true" aria-label={t.journal.lightbox.of(index + 1, media.length)}
      className="fixed inset-0 z-[60] flex flex-col bg-ink-950/95 text-paper" data-testid="lightbox"
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touch.current;
        const end = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50 || media.length < 2) return;
        if (end < start) next();
        else prev();
      }}>
      <div className="flex items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <span className="text-sm font-semibold tabular-nums text-paper/80">{t.journal.lightbox.of(index + 1, media.length)}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t.journal.lightbox.close}
          className="grid size-11 place-items-center rounded-full hover:bg-paper/10"><X className="size-6" aria-hidden /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {m.url ? (
          <img key={m.id} src={m.url} alt={m.caption ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />
        ) : (
          <LoaderCircle className="size-8 animate-spin" aria-hidden />
        )}
        {media.length > 1 && (
          <>
            <button type="button" onClick={prev} aria-label={t.journal.lightbox.prev}
              className="absolute top-1/2 left-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-ink-900/60 hover:bg-ink-900 sm:grid">
              <ChevronLeft className="size-7" aria-hidden />
            </button>
            <button type="button" onClick={next} aria-label={t.journal.lightbox.next}
              className="absolute top-1/2 right-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-ink-900/60 hover:bg-ink-900 sm:grid">
              <ChevronRight className="size-7" aria-hidden />
            </button>
          </>
        )}
      </div>
      <PhotoInfo key={m.id} media={m} tripId={tripId} onDeleted={() => (media.length <= 1 ? onClose() : onIndex(Math.min(index, media.length - 2)))} />
    </div>
  );
}

function PhotoInfo({ media, tripId, onDeleted }: { media: MediaItem; tripId: string | null; onDeleted: () => void }) {
  const [caption, setCaption] = useState(media.caption ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [pending, start] = useTransition();
  const when = media.takenAt ?? media.createdAt;
  const dirty = caption.trim() !== (media.caption ?? "");

  return (
    <div className="space-y-2 bg-ink-950 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-sm">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-paper/70">
        <span>{media.takenAt ? `${t.journal.lightbox.taken}: ` : ""}{formatDate(when)} · {formatTime(when)}</span>
        {media.lat !== null && media.lng !== null && (
          <a href={`https://www.openstreetmap.org/?mlat=${media.lat}&mlon=${media.lng}#map=15/${media.lat}/${media.lng}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline" title={t.journal.lightbox.location}>
            <MapPin className="size-3.5" aria-hidden /> {media.lat.toFixed(4)}, {media.lng.toFixed(4)}
          </a>
        )}
      </p>
      <form className="flex gap-2" onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await updateMediaCaption(media.id, caption.trim() || null, tripId);
          if (!r.ok) setError(r.message);
          else setSavedNote(true);
        });
      }}>
        <label htmlFor={`cap-${media.id}`} className="sr-only">{t.journal.lightbox.caption}</label>
        <input id={`cap-${media.id}`} value={caption} maxLength={2000} placeholder={t.journal.lightbox.captionPlaceholder}
          onChange={(e) => { setCaption(e.target.value); setSavedNote(false); }}
          className="h-10 min-w-0 flex-1 rounded-xl border border-paper/20 bg-ink-900 px-3 text-paper outline-none placeholder:text-paper/40 focus:border-amber-400" />
        {dirty && <Button type="submit" size="sm" variant="accent" disabled={pending}>{t.journal.lightbox.saveCaption}</Button>}
      </form>
      {savedNote && <p className="text-xs text-paper/60" role="status">{t.journal.saved}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t.journal.lightbox.deleteConfirm}</span>
          <Button type="button" size="sm" variant="danger" disabled={pending} onClick={() => start(async () => {
            const r = await deleteMedia([media.id], tripId);
            if (!r.ok) setError(r.message);
            else onDeleted();
          })}>{t.journal.lightbox.deleteYes}</Button>
          <Button type="button" size="sm" variant="ghost" className="text-paper hover:bg-paper/10" onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-paper/70 hover:text-paper">
          <Trash2 className="size-3.5" aria-hidden /> {t.journal.lightbox.delete}
        </button>
      )}
    </div>
  );
}
