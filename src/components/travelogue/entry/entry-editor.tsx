"use client";
import { useHydrated } from "@/lib/use-hydrated";
import { ArrowLeft, ChevronLeft, ChevronRight, Footprints, MapPinned, NotebookPen, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/journal/note-editor";
import { RichEditor } from "@/components/travelogue/editor/rich-editor-lazy";
import { SaveStatus } from "@/components/travelogue/save-status";
import { statusView } from "@/components/travelogue/workspace/autosave-view";
import { useServerReload } from "@/components/travelogue/workspace/use-server-reload";
import { deleteEntry, saveEntry } from "@/lib/actions/travelogue";
import { useAutosave } from "@/lib/travelogue/use-autosave";
import { isDocEmpty, type Doc } from "@/lib/travelogue/doc";
import { ENTRY_TAGS, ENTRY_TYPES, type EntryType, type TravelogueEntry } from "@/lib/travelogue/types";
import type { MediaItem } from "@/lib/journal/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { isoToLocalInput, localInputToIso } from "./datetime";
import { LocationPicker, type EntryLocation } from "./location-picker";
import { PhotoManager } from "./photo-manager";
import { RevisionsButton } from "./revisions-dialog";

const T = t.travelogue.pages.entry;
const TYPES = t.travelogue.pages.entries.types;
const TYPE_ICON: Record<EntryType, typeof MapPinned> = { place: MapPinned, chronicle: Footprints, free: NotebookPen };

type EntryP = {
  entryType: EntryType;
  title: string;
  locationName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  osmRef: string | null;
  savedPlaceId: string | null;
  visitedAt: string | null;
  tags: string[];
  introduction: Doc | null;
  narrative: Doc | null;
  historyNotes: Doc | null;
  personalReview: Doc | null;
};

type OptionalRich = "introduction" | "historyNotes" | "personalReview";
const OPTIONAL: { key: OptionalRich; label: string }[] = [
  { key: "introduction", label: T.introduction },
  { key: "historyNotes", label: T.historyNotes },
  { key: "personalReview", label: T.personalReview },
];

type Props = {
  travelogueId: string;
  entry: TravelogueEntry;
  media: MediaItem[];
  userId: string;
  tripId: string | null;
  styleUrl: string;
  prevId: string | null;
  nextId: string | null;
  position: { index: number; total: number };
};

/** Yazı düzenleyici. Önceki sürümü geri yükleme ya da çakışmada sunucudakini alma düzenleyiciyi yeniden kurar. */
export function EntryEditor(props: Props) {
  const reload = useServerReload();
  return <EntryEditorInner key={`${props.entry.id}:${reload.gen}`} {...props} onReload={reload.reload} />;
}

function EntryEditorInner({ travelogueId, entry, media, userId, tripId, styleUrl, prevId, nextId, position, onReload }: Props & { onReload: () => void }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const autosave = useAutosave<EntryP>({
    key: `rovia:entry:${entry.id}`,
    version: entry.version,
    save: ({ patch, version, force }) => saveEntry({ id: entry.id, version, force, patch }),
  });
  const [overrides, setOverrides] = useState<Partial<EntryP>>({});
  const [formGen, setFormGen] = useState(0);
  const view = statusView<EntryP, typeof autosave>(autosave, (b) => {
    setOverrides((o) => ({ ...o, ...b }));
    setFormGen((g) => g + 1);
  });
  const [navigating, startNav] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial: EntryP = {
    entryType: entry.entryType, title: entry.title, locationName: entry.locationName, address: entry.address,
    lat: entry.lat, lng: entry.lng, osmRef: entry.osmRef, savedPlaceId: entry.savedPlaceId, visitedAt: entry.visitedAt,
    tags: entry.tags, introduction: entry.introduction, narrative: entry.narrative, historyNotes: entry.historyNotes,
    personalReview: entry.personalReview, ...overrides,
  };

  const base = `/seyahatnameler/${travelogueId}`;
  /** Bekleyen değişiklikleri kaydedip git (kayıt başarısızsa yedek localStorage'da kalır) */
  const go = (href: string) => startNav(async () => {
    await autosave.flush();
    router.push(href);
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8" data-testid="entry-editor" data-ready={hydrated || undefined}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a href={base} onClick={(e) => { e.preventDefault(); go(base); }} data-testid="entry-back"
            className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-ink-900">
            <ArrowLeft className="size-4" aria-hidden /> {T.back}
          </a>
          <SaveStatus autosave={view} onReload={onReload} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">{T.heading} · {T.position(position.index + 1, position.total)}</p>
          <nav className="flex items-center gap-1" aria-label={T.heading}>
            <Button type="button" size="sm" variant="ghost" disabled={!prevId || navigating} onClick={() => prevId && go(`${base}/yazi/${prevId}`)}>
              <ChevronLeft className="size-4" aria-hidden /> {T.prev}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={!nextId || navigating} onClick={() => nextId && go(`${base}/yazi/${nextId}`)}>
              {T.next} <ChevronRight className="size-4" aria-hidden />
            </Button>
          </nav>
        </div>
      </header>

      <EntryForm key={formGen} initial={initial} media={media} userId={userId} tripId={tripId} styleUrl={styleUrl}
        onPatch={(p) => autosave.update(p)} onMediaUploaded={() => router.refresh()} />

      <PhotoManager entryId={entry.id} initial={entry.photos} media={media} userId={userId} tripId={tripId} />

      <footer className="flex flex-wrap items-center gap-2 border-t border-sand-200 pt-5">
        <RevisionsButton entryId={entry.id} beforeRestore={() => autosave.flush()} onRestored={onReload} />
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2" role="alertdialog" aria-label={T.deleteConfirm}>
            <span className="text-sm font-semibold">{T.deleteConfirm}</span>
            <Button type="button" size="sm" variant="danger" disabled={deleting} data-testid="entry-delete-confirm" onClick={() => startDelete(async () => {
              setError(null);
              autosave.resolveConflict("theirs"); // bekleyen kaydı bırak
              const r = await deleteEntry(entry.id);
              if (r.ok) router.replace(base);
              else { setError(r.message); setConfirming(false); }
            })}>{T.deleteYes}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} data-testid="entry-delete">
            <Trash2 className="size-4" aria-hidden /> {T.delete}
          </Button>
        )}
        {error && <Alert tone="error" className="w-full">{error}</Alert>}
      </footer>
    </div>
  );
}

function EntryForm({ initial, media, userId, tripId, styleUrl, onPatch, onMediaUploaded }: {
  initial: EntryP; media: MediaItem[]; userId: string; tripId: string | null; styleUrl: string;
  onPatch: (p: Partial<EntryP>) => void; onMediaUploaded: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [type, setType] = useState(initial.entryType);
  const [visited, setVisited] = useState(isoToLocalInput(initial.visitedAt));
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [customTag, setCustomTag] = useState("");
  const [shown, setShown] = useState<OptionalRich[]>(OPTIONAL.filter((o) => !isDocEmpty(initial[o.key])).map((o) => o.key));

  const setTagList = (next: string[]) => { setTags(next); onPatch({ tags: next }); };
  const toggleTag = (tag: string) => setTagList(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]);
  const addCustom = () => {
    const v = customTag.trim().toLocaleLowerCase("tr").slice(0, 40);
    if (v && !tags.includes(v) && tags.length < 20) setTagList([...tags, v]);
    setCustomTag("");
  };
  const customTags = tags.filter((x) => !(ENTRY_TAGS as readonly string[]).includes(x));

  const rich = (key: "narrative" | OptionalRich, label: string, placeholder?: string) => (
    <RichEditor value={initial[key]} label={label} placeholder={placeholder} media={media} userId={userId} tripId={tripId}
      onMediaUploaded={onMediaUploaded} testId={`entry-${key}`} onChange={(doc) => onPatch({ [key]: doc } as Partial<EntryP>)} />
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <label htmlFor="entry-title" className="sr-only">{T.title}</label>
        <input id="entry-title" className={cn(fieldClass, "h-14 font-serif text-2xl font-bold")} value={title} maxLength={200}
          placeholder={T.titlePlaceholder} data-testid="entry-title"
          onChange={(e) => { setTitle(e.target.value); onPatch({ title: e.target.value }); }} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold text-ink-800">{T.type}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {ENTRY_TYPES.map((ty) => {
            const Icon = TYPE_ICON[ty];
            return (
              <button key={ty} type="button" role="radio" aria-checked={type === ty} onClick={() => { setType(ty); onPatch({ entryType: ty }); }}
                className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
                  type === ty ? "border-ink-900 bg-ink-900 text-paper" : "border-sand-300 bg-paper-50 text-ink-800 hover:bg-white")}>
                <Icon className="size-4" aria-hidden /> {TYPES[ty]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="entry-visited" className="block text-sm font-semibold text-ink-800">{T.visitedAt}</label>
        <div className="flex gap-2">
          <input id="entry-visited" type="datetime-local" className={cn(fieldClass, "h-11 max-w-xs")} value={visited}
            aria-describedby="entry-visited-hint" data-testid="entry-visited"
            onChange={(e) => {
              setVisited(e.target.value);
              const iso = localInputToIso(e.target.value);
              if (iso || !e.target.value) onPatch({ visitedAt: iso });
            }} />
          {visited && (
            <button type="button" aria-label={T.visitedAtClear} title={T.visitedAtClear} onClick={() => { setVisited(""); onPatch({ visitedAt: null }); }}
              className="grid size-11 place-items-center rounded-full text-stone-600 hover:bg-sand-100"><X className="size-4" aria-hidden /></button>
          )}
        </div>
        <p id="entry-visited-hint" className="text-xs text-stone-600">{T.visitedAtHint}</p>
      </div>

      <section aria-labelledby="entry-location" className="space-y-2">
        <h2 id="entry-location" className="text-sm font-semibold text-ink-800">{T.location}</h2>
        <LocationPicker styleUrl={styleUrl}
          initial={{ locationName: initial.locationName, address: initial.address, lat: initial.lat, lng: initial.lng, osmRef: initial.osmRef }}
          onChange={(l: EntryLocation) => onPatch(l)} />
      </section>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink-800">{T.tags}</legend>
        <div className="flex flex-wrap gap-1.5">
          {[...ENTRY_TAGS, ...customTags].map((tag) => {
            const on = tags.includes(tag);
            return (
              <button key={tag} type="button" aria-pressed={on} onClick={() => toggleTag(tag)} data-testid="entry-tag"
                className={cn("h-8 rounded-full border px-3 text-sm", on ? "border-amber-500 bg-amber-100 font-semibold text-ink-900" : "border-sand-300 bg-paper-50 text-stone-700 hover:bg-white")}>
                {tag}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <label htmlFor="entry-custom-tag" className="sr-only">{T.customTag}</label>
          <input id="entry-custom-tag" className={cn(fieldClass, "h-9 max-w-56 text-sm")} value={customTag} maxLength={40} placeholder={T.customTag}
            data-testid="entry-custom-tag"
            onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
          <Button type="button" size="sm" variant="secondary" onClick={addCustom} disabled={!customTag.trim()} data-testid="entry-custom-tag-add">{T.addTag}</Button>
        </div>
      </fieldset>

      {shown.includes("introduction") && <RichBlock title={T.introduction}>{rich("introduction", T.introduction)}</RichBlock>}
      <RichBlock title={T.narrative}>{rich("narrative", T.narrative, T.narrativePlaceholder)}</RichBlock>
      {shown.includes("historyNotes") && <RichBlock title={T.historyNotes}>{rich("historyNotes", T.historyNotes)}</RichBlock>}
      {shown.includes("personalReview") && <RichBlock title={T.personalReview}>{rich("personalReview", T.personalReview)}</RichBlock>}
      {shown.length < OPTIONAL.length && (
        <div className="flex flex-wrap gap-2">
          {OPTIONAL.filter((o) => !shown.includes(o.key)).map((o) => (
            <Button key={o.key} type="button" size="sm" variant="secondary" onClick={() => setShown((s) => [...s, o.key])}>
              <Plus className="size-4" aria-hidden /> {o.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function RichBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
      {children}
    </section>
  );
}
