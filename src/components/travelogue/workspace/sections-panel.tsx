"use client";
import { ArrowDown, ArrowUp, Eye, EyeOff, LoaderCircle, PenLine, Pencil, Plus, Trash2 } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/journal/note-editor";
import { RichEditor } from "@/components/travelogue/editor/rich-editor-lazy";
import { SaveStatus } from "@/components/travelogue/save-status";
import { addSection, deleteSection, reorderTravelogue, saveSection } from "@/lib/actions/travelogue";
import { useAutosave } from "@/lib/travelogue/use-autosave";
import { TEXT_SECTION_KINDS, type TravelogueSection } from "@/lib/travelogue/types";
import type { Doc } from "@/lib/travelogue/doc";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { statusView } from "./autosave-view";

const T = t.travelogue.pages.sections;

type SectionP = { title: string; isVisible: boolean; content: Doc | null };

type Ctx = { media: MediaItem[]; userId: string; tripId: string | null; onReload: () => void; onMediaUploaded: () => void };

export function SectionsPanel({ travelogueId, sections, ctx }: { travelogueId: string; sections: TravelogueSection[]; ctx: Ctx }) {
  const [order, setOrder] = useOptimistic(sections.map((s) => s.id));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const byId = new Map(sections.map((s) => [s.id, s]));
  const list = order.map((id) => byId.get(id)).filter((s): s is TravelogueSection => !!s);

  function move(i: number, dir: -1 | 1) {
    const ids = list.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setError(null);
    start(async () => {
      setOrder(ids);
      const r = await reorderTravelogue(travelogueId, "sections", ids);
      if (!r.ok) setError(r.message);
    });
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const title = adding.trim();
    if (!title) return;
    setError(null);
    start(async () => {
      const r = await addSection(travelogueId, title);
      if (!r.ok) setError(r.message);
      else setAdding("");
    });
  }

  return (
    <section aria-labelledby="sections-title" className="space-y-3" data-testid="sections-panel">
      <div>
        <h2 id="sections-title" className="text-lg font-extrabold tracking-tight">{T.title}</h2>
        <p className="text-sm text-stone-600">{T.hint}</p>
      </div>
      <ol className="space-y-2">
        {list.map((s, i) => (
          <SectionRow key={s.id} section={s} index={i} count={list.length} ctx={ctx} busy={pending}
            onMove={(dir) => move(i, dir)} onError={setError} />
        ))}
      </ol>
      {error && <Alert tone="error">{error}</Alert>}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="section-add" className="sr-only">{T.addPlaceholder}</label>
        <input id="section-add" className={cn(fieldClass, "h-10 min-w-0 flex-1 text-sm")} value={adding} maxLength={200}
          placeholder={T.addPlaceholder} onChange={(e) => setAdding(e.target.value)} data-testid="section-add-input" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !adding.trim()} data-testid="section-add">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />} {T.add}
        </Button>
      </form>
    </section>
  );
}

function SectionRow({ section, index, count, ctx, busy, onMove, onError }: {
  section: TravelogueSection; index: number; count: number; ctx: Ctx; busy: boolean;
  onMove: (dir: -1 | 1) => void; onError: (m: string | null) => void;
}) {
  const autosave = useAutosave<SectionP>({
    key: `rovia:travelogue-section:${section.id}`,
    version: section.version,
    save: ({ patch, version, force }) => saveSection({ id: section.id, version, force, patch }),
  });
  const [title, setTitle] = useState(section.title);
  const [visible, setVisible] = useState(section.isVisible);
  const [content, setContent] = useState<Doc | null>(section.content);
  const [editorGen, setEditorGen] = useState(0);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(section.title);
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const isText = TEXT_SECTION_KINDS.includes(section.kind);
  const autoHint = T.auto[section.kind];

  const view = statusView<SectionP, typeof autosave>(autosave, (b) => {
    if (b.title !== undefined) { setTitle(b.title); setDraftTitle(b.title); }
    if (b.isVisible !== undefined) setVisible(b.isVisible);
    if (b.content !== undefined) { setContent(b.content); setEditorGen((g) => g + 1); setOpen(true); }
  });

  function toggleVisible() {
    const next = !visible;
    setVisible(next);
    autosave.update({ isVisible: next });
    void autosave.flush();
  }

  function rename(e: React.FormEvent) {
    e.preventDefault();
    const v = draftTitle.trim();
    if (!v) return;
    setTitle(v);
    setRenaming(false);
    autosave.update({ title: v });
    void autosave.flush();
  }

  return (
    <li className={cn("rounded-2xl border bg-white", visible ? "border-sand-200" : "border-dashed border-sand-300 bg-paper-50")}
      data-testid="section-row" data-kind={section.kind}>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="w-6 shrink-0 text-center text-xs font-bold text-stone-500 tabular-nums">{index + 1}</span>
        <span className="min-w-0 flex-1">
          {renaming ? (
            <form onSubmit={rename} className="flex gap-2">
              <label htmlFor={`sec-title-${section.id}`} className="sr-only">{T.renameLabel}</label>
              <input id={`sec-title-${section.id}`} autoFocus className={cn(fieldClass, "h-9 text-sm")} value={draftTitle} maxLength={200}
                onChange={(e) => setDraftTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(false); }} />
              <Button type="submit" size="sm" variant="secondary" disabled={!draftTitle.trim()}>{t.common.save}</Button>
            </form>
          ) : (
            <span className={cn("block truncate font-semibold", !visible && "text-stone-500")} data-testid="section-title">
              {title}{!visible && <span className="ml-2 text-xs font-normal">({T.hidden})</span>}
            </span>
          )}
        </span>
        {!renaming && (
          <span className="flex shrink-0 items-center">
            <IconBtn label={T.up(title)} disabled={busy || index === 0} onClick={() => onMove(-1)}><ArrowUp className="size-4" /></IconBtn>
            <IconBtn label={T.down(title)} disabled={busy || index === count - 1} onClick={() => onMove(1)}><ArrowDown className="size-4" /></IconBtn>
            <IconBtn label={visible ? T.hide : T.show} pressed={!visible} onClick={toggleVisible}>
              {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </IconBtn>
            <IconBtn label={T.rename} onClick={() => { setDraftTitle(title); setRenaming(true); }}><Pencil className="size-4" /></IconBtn>
            {section.kind === "custom" && (
              <IconBtn label={T.delete} onClick={() => setConfirming(true)}><Trash2 className="size-4" /></IconBtn>
            )}
          </span>
        )}
      </div>

      {confirming && (
        <div className="mx-3 mb-3 space-y-2 rounded-xl bg-sand-100/70 p-3" role="alertdialog" aria-label={T.deleteConfirm}>
          <p className="text-sm font-semibold">{T.deleteConfirm}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="danger" disabled={deleting} onClick={() => startDelete(async () => {
              onError(null);
              const r = await deleteSection(section.id);
              if (!r.ok) { onError(r.message); setConfirming(false); }
            })}>{T.deleteYes}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
          </div>
        </div>
      )}

      <div className="space-y-2 px-3 pb-3 pl-11">
        {isText ? (
          open ? (
            <div className="space-y-2">
              <RichEditor key={editorGen} value={content} label={T.editorLabel(title)} placeholder={T.placeholder}
                media={ctx.media} userId={ctx.userId} tripId={ctx.tripId} onMediaUploaded={ctx.onMediaUploaded}
                testId={`section-editor-${section.kind}`}
                onChange={(doc) => { setContent(doc); autosave.update({ content: doc }); }} />
              <div className="flex items-center justify-between gap-2">
                <SaveStatus autosave={view} onReload={ctx.onReload} />
                <button type="button" className="text-sm font-semibold text-stone-600 underline" onClick={() => { void autosave.flush(); setOpen(false); }}>
                  {T.collapse}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setOpen(true)} data-testid="section-edit"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 hover:underline">
                <PenLine className="size-4" aria-hidden /> {T.edit}
              </button>
              {(autosave.status !== "idle" || autosave.backup) && <SaveStatus autosave={view} onReload={ctx.onReload} />}
            </div>
          )
        ) : (
          <>
            {autoHint && <p className="text-xs text-stone-600">{autoHint}</p>}
            {(autosave.status !== "idle" || autosave.backup) && <SaveStatus autosave={view} onReload={ctx.onReload} />}
          </>
        )}
      </div>
    </li>
  );
}

function IconBtn({ label, onClick, disabled, pressed, children }: {
  label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={pressed}
      className="grid size-9 place-items-center rounded-full text-stone-600 hover:bg-sand-100 hover:text-ink-900 disabled:opacity-30">
      <span aria-hidden>{children}</span>
    </button>
  );
}
