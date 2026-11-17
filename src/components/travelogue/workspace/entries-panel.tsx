"use client";
import { ArrowDown, ArrowUp, Footprints, Images, LoaderCircle, MapPin, MapPinned, NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createEntry, reorderTravelogue } from "@/lib/actions/travelogue";
import { ENTRY_TYPES, type EntryType, type TravelogueEntry } from "@/lib/travelogue/types";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { Modal } from "./modal";

const T = t.travelogue.pages.entries;
const TYPE_ICON: Record<EntryType, typeof MapPin> = { place: MapPinned, chronicle: Footprints, free: NotebookPen };

export const entryLabel = (e: Pick<TravelogueEntry, "title" | "locationName">) => e.title.trim() || e.locationName || T.untitled;

/** Yazı listesi; `entries` görüntüleme sırasındadır (ordering'e göre). */
export function EntriesPanel({ travelogueId, entries, ordering, onOrdering, highlightedId, onFocusMap }: {
  travelogueId: string; entries: TravelogueEntry[]; ordering: "chronological" | "manual";
  onOrdering: (o: "chronological" | "manual", currentIds: string[]) => void;
  highlightedId: string | null; onFocusMap: (id: string) => void;
}) {
  const [order, setOrder] = useOptimistic(entries.map((e) => e.id));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const list = order.map((id) => byId.get(id)).filter((e): e is TravelogueEntry => !!e);

  function move(i: number, dir: -1 | 1) {
    const ids = list.map((e) => e.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setError(null);
    start(async () => {
      setOrder(ids);
      const r = await reorderTravelogue(travelogueId, "entries", ids);
      if (!r.ok) setError(r.message);
    });
  }

  return (
    <section aria-labelledby="entries-title" className="space-y-3" data-testid="entries-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="entries-title" className="text-lg font-extrabold tracking-tight">{T.title}</h2>
        <Button type="button" size="sm" variant="accent" onClick={() => setCreating(true)} data-testid="new-entry">
          <Plus className="size-4" aria-hidden /> {T.newEntry}
        </Button>
      </div>

      {entries.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-ink-800" id="ordering-label">{T.ordering}</span>
          <div className="inline-flex rounded-full border border-sand-300 bg-paper-50 p-1" role="radiogroup" aria-labelledby="ordering-label">
            {(["chronological", "manual"] as const).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={ordering === o} data-testid={`ordering-${o}`}
                onClick={() => { if (o !== ordering) onOrdering(o, list.map((e) => e.id)); }}
                className={cn("h-8 rounded-full px-3 text-sm font-semibold", ordering === o ? "bg-ink-900 text-paper" : "text-ink-800 hover:bg-sand-100")}>
                {T[o]}
              </button>
            ))}
          </div>
          {ordering === "chronological" && <p className="w-full text-xs text-stone-600">{T.orderingHint}</p>}
        </div>
      )}

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-sand-300 p-6 text-center text-sm text-stone-600" data-testid="entries-empty">{T.empty}</p>
      ) : (
        <ol className="space-y-2">
          {list.map((e, i) => {
            const Icon = TYPE_ICON[e.entryType] ?? NotebookPen;
            const hasLoc = e.lat !== null && e.lng !== null;
            const label = entryLabel(e);
            return (
              <li key={e.id} id={`entry-${e.id}`} data-testid="entry-row"
                className={cn("scroll-mt-24 rounded-2xl border bg-white p-3 transition",
                  highlightedId === e.id ? "border-amber-500 ring-4 ring-amber-400/30" : "border-sand-200")}>
                <div className="flex gap-3">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-xs font-extrabold",
                    hasLoc ? "bg-ink-900 text-paper" : "bg-sand-100 text-stone-600")}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/seyahatnameler/${travelogueId}/yazi/${e.id}`} className="font-serif text-lg leading-snug font-bold hover:underline"
                      data-testid="entry-link">
                      {label}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-600">
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><Icon className="size-3.5" aria-hidden />{T.types[e.entryType]}</span>
                      {e.visitedAt && <span className="tabular-nums">{formatDate(e.visitedAt)} · {formatTime(e.visitedAt)}</span>}
                      {e.locationName && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{e.locationName}</span></span>}
                      {e.photos.length > 0 && <span className="inline-flex items-center gap-1"><Images className="size-3.5" aria-hidden />{T.photos(e.photos.length)}</span>}
                    </p>
                    {e.contentText && <p className="mt-1 line-clamp-2 text-sm text-ink-800">{excerpt(e)}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-center">
                    {hasLoc && (
                      <IconBtn label={T.focusMap(label)} onClick={() => onFocusMap(e.id)} testId="entry-focus"><MapPin className="size-4" /></IconBtn>
                    )}
                    {ordering === "manual" && list.length > 1 && (
                      <>
                        <IconBtn label={T.up(label)} disabled={pending || i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconBtn>
                        <IconBtn label={T.down(label)} disabled={pending || i === list.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconBtn>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <Modal open={creating} onClose={() => setCreating(false)} title={T.newTitle} testId="new-entry-dialog">
        <NewEntryChoices travelogueId={travelogueId} />
      </Modal>
    </section>
  );
}

/** content_text başlıkla başlar; önizlemede başlığı tekrarlama. */
function excerpt(e: TravelogueEntry) {
  const text = (e.contentText ?? "").trim();
  const body = e.title && text.startsWith(e.title) ? text.slice(e.title.length) : text;
  return body.replace(/\s+/g, " ").trim().slice(0, 220);
}

function NewEntryChoices({ travelogueId }: { travelogueId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<EntryType | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {ENTRY_TYPES.map((type) => {
        const Icon = TYPE_ICON[type];
        return (
          <button key={type} type="button" disabled={pending} data-testid={`new-entry-${type}`}
            onClick={() => {
              setChosen(type);
              setError(null);
              start(async () => {
                const r = await createEntry(travelogueId, { entryType: type });
                if (!r.ok) setError(r.message);
                else router.push(`/seyahatnameler/${travelogueId}/yazi/${r.id}`);
              });
            }}
            className="flex w-full items-start gap-3 rounded-2xl border border-sand-200 bg-paper-50 p-3 text-left hover:border-stone-500 hover:bg-white disabled:opacity-60">
            {pending && chosen === type ? <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin" aria-hidden />
              : <Icon className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />}
            <span>
              <span className="block font-semibold">{T.types[type]}</span>
              <span className="block text-sm text-stone-600">{T.typeHints[type]}</span>
            </span>
          </button>
        );
      })}
      {error && <Alert tone="error">{error}</Alert>}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children, testId }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} data-testid={testId}
      className="grid size-9 place-items-center rounded-full text-stone-600 hover:bg-sand-100 hover:text-ink-900 disabled:opacity-30">
      <span aria-hidden>{children}</span>
    </button>
  );
}
