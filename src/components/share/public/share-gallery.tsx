"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan kısa ömürlü imzalı bağlantılar; Next görsel optimizasyonu kullanılmıyor */
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/journal/types";
import { t } from "@/i18n";

const P = t.share.page;

/** Salt okunur fotoğraf ızgarası + tam ekran görüntüleyici (ok tuşları, kaydırma, Esc). */
export function ShareGallery({ photos }: { photos: MediaItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="share-gallery">
        {photos.map((m, i) => (
          <li key={m.id}>
            <button type="button" onClick={() => setOpen(i)} aria-label={m.caption || P.photoAlt(i + 1)}
              className="group block aspect-[4/3] w-full overflow-hidden rounded-xl bg-sand-100">
              {(m.thumbUrl ?? m.url) && <img src={m.thumbUrl ?? m.url ?? undefined} alt={m.caption ?? ""} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />}
            </button>
          </li>
        ))}
      </ul>
      {open !== null && photos[open] && <Viewer photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function Viewer({ photos, index, onIndex, onClose }: { photos: MediaItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const m = photos[index];
  const touch = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = photos.length;
  const prev = () => onIndex((index - 1 + n) % n);
  const next = () => onIndex((index + 1) % n);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onIndex((index - 1 + n) % n);
      else if (e.key === "ArrowRight") onIndex((index + 1) % n);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, n, onClose, onIndex]);

  return (
    <div role="dialog" aria-modal="true" aria-label={m.caption || P.photoAlt(index + 1)}
      className="fixed inset-0 z-[60] flex flex-col bg-ink-950/95 text-paper"
      onTouchStart={(e) => { touch.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        const start = touch.current;
        const end = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50 || n < 2) return;
        if (end < start) next();
        else prev();
      }}>
      <div className="flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2">
        <span className="text-sm font-semibold tabular-nums text-paper/80">{index + 1} / {n}</span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={P.closePhoto}
          className="grid size-11 place-items-center rounded-full hover:bg-paper/10"><X className="size-6" aria-hidden /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        {m.url && <img key={m.id} src={m.url} alt={m.caption ?? ""} className="max-h-full max-w-full rounded-lg object-contain" />}
        {n > 1 && (
          <>
            <button type="button" onClick={prev} aria-label={P.prevPhoto}
              className="absolute top-1/2 left-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-ink-900/60 hover:bg-ink-900 sm:grid">
              <ChevronLeft className="size-7" aria-hidden />
            </button>
            <button type="button" onClick={next} aria-label={P.nextPhoto}
              className="absolute top-1/2 right-2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-ink-900/60 hover:bg-ink-900 sm:grid">
              <ChevronRight className="size-7" aria-hidden />
            </button>
          </>
        )}
      </div>
      <p className="min-h-12 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] text-center text-sm text-paper/80">{m.caption}</p>
    </div>
  );
}
