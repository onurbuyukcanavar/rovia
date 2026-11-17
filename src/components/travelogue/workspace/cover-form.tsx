"use client";
/* eslint-disable @next/next/no-img-element -- özel kovadan imzalı küçük görseller */
import { Check, ImageOff } from "lucide-react";
import { useState } from "react";
import { fieldClass } from "@/components/journal/note-editor";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const T = t.travelogue.pages.workspace;

export type TravP = {
  title: string;
  subtitle: string | null;
  purpose: string | null;
  summary: string | null;
  coverMediaId: string | null;
  ordering: "chronological" | "manual";
  status: "draft" | "published";
};

/** Kapak bilgileri formu. Değerler bağlanınca yerel durumda tutulur; her değişiklik otomatik kayda yama olarak gider. */
export function CoverForm({ initial, media, onPatch }: {
  initial: TravP; media: MediaItem[]; onPatch: (patch: Partial<TravP>) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle ?? "");
  const [purpose, setPurpose] = useState(initial.purpose ?? "");
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [cover, setCover] = useState(initial.coverMediaId);
  const [status, setStatus] = useState(initial.status);
  const [picking, setPicking] = useState(false);
  const coverItem = media.find((m) => m.id === cover) ?? null;
  const nullable = (v: string) => (v.trim() ? v : null);

  return (
    <div className="space-y-4" data-testid="cover-form">
      <div className="space-y-1.5">
        <label htmlFor="tl-title" className="block text-sm font-semibold text-ink-800">{T.title}</label>
        <input id="tl-title" className={cn(fieldClass, "h-12 font-serif text-xl font-bold")} value={title} maxLength={200} required
          aria-invalid={!title.trim() || undefined} data-testid="tl-title"
          onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) onPatch({ title: e.target.value.trim() }); }} />
        {!title.trim() && <p className="text-sm text-danger">{t.travelogue.errors.titleRequired}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="tl-subtitle" className="block text-sm font-semibold text-ink-800">{T.subtitle}</label>
        <input id="tl-subtitle" className={cn(fieldClass, "h-11")} value={subtitle} maxLength={300}
          onChange={(e) => { setSubtitle(e.target.value); onPatch({ subtitle: nullable(e.target.value) }); }} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="tl-purpose" className="block text-sm font-semibold text-ink-800">{T.purpose}</label>
        <textarea id="tl-purpose" rows={2} className={cn(fieldClass, "py-2")} value={purpose} maxLength={2000} placeholder={T.purposePlaceholder}
          onChange={(e) => { setPurpose(e.target.value); onPatch({ purpose: nullable(e.target.value) }); }} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="tl-summary" className="block text-sm font-semibold text-ink-800">{T.summary}</label>
        <textarea id="tl-summary" rows={4} className={cn(fieldClass, "py-2")} value={summary} maxLength={5000} placeholder={T.summaryPlaceholder}
          onChange={(e) => { setSummary(e.target.value); onPatch({ summary: nullable(e.target.value) }); }} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink-800">{T.coverPhoto}</p>
        <div className="flex items-center gap-3">
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-sand-100">
            {coverItem?.thumbUrl ? <img src={coverItem.thumbUrl} alt="" className="size-full object-cover" />
              : <ImageOff className="size-6 text-stone-400" aria-hidden />}
          </span>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPicking((v) => !v)} aria-expanded={picking}
              className="text-sm font-semibold text-ink-800 underline underline-offset-2">{T.coverPick}</button>
            {cover && (
              <button type="button" onClick={() => { setCover(null); onPatch({ coverMediaId: null }); }}
                className="text-sm text-stone-600 underline underline-offset-2">{T.coverRemove}</button>
            )}
          </div>
        </div>
        {picking && (media.length === 0 ? <p className="text-sm text-stone-600">{T.coverEmpty}</p> : (
          <ul className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6" aria-label={T.coverPick}>
            {media.map((m) => (
              <li key={m.id}>
                <button type="button" aria-pressed={cover === m.id} aria-label={m.caption || T.coverPhoto}
                  onClick={() => { setCover(m.id); setPicking(false); onPatch({ coverMediaId: m.id }); }}
                  className={cn("relative block aspect-square w-full overflow-hidden rounded-lg bg-sand-100", cover === m.id && "ring-4 ring-amber-500")}>
                  {m.thumbUrl && <img src={m.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />}
                  {cover === m.id && <Check className="absolute top-1 right-1 size-5 rounded-full bg-amber-500 p-0.5 text-ink-950" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold text-ink-800">{T.status}</legend>
        <div className="inline-flex rounded-full border border-sand-300 bg-paper-50 p-1" role="radiogroup">
          {(["draft", "published"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s}
              onClick={() => { setStatus(s); onPatch({ status: s }); }}
              className={cn("h-9 rounded-full px-4 text-sm font-semibold", status === s ? "bg-ink-900 text-paper" : "text-ink-800 hover:bg-sand-100")}>
              {s === "draft" ? T.statusDraft : T.statusPublished}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-600">{T.statusHint}</p>
      </fieldset>
    </div>
  );
}
