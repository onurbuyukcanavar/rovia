"use client";
import { useHydrated } from "@/lib/use-hydrated";
import { ArrowLeft, BookOpen, Map as MapIcon, Route, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { MapFrame, isMobileViewport, useMapExpand } from "@/components/map/map-frame";
import { SaveStatus } from "@/components/travelogue/save-status";
import { deleteTravelogue, reorderTravelogue, saveTravelogue } from "@/lib/actions/travelogue";
import { useAutosave } from "@/lib/travelogue/use-autosave";
import { orderEntries, type Travelogue } from "@/lib/travelogue/types";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { statusView } from "./autosave-view";
import { CoverForm, type TravP } from "./cover-form";
import { EntriesPanel, entryLabel } from "./entries-panel";
import { SectionsPanel } from "./sections-panel";
import { TravelogueMap, type EntryPoint, type MapFocus } from "./travelogue-map";
import { useServerReload } from "./use-server-reload";

const T = t.travelogue.pages.workspace;

type Props = { travelogue: Travelogue; userId: string; styleUrl: string };

/** Seyahatname çalışma alanı. Çakışmada sunucudakini almak düzenleyicileri yeniden kurar. */
export function Workspace(props: Props) {
  const reload = useServerReload();
  return <WorkspaceInner key={reload.gen} {...props} onReload={reload.reload} />;
}

function WorkspaceInner({ travelogue: tv, userId, styleUrl, onReload }: Props & { onReload: () => void }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const autosave = useAutosave<TravP>({
    key: `rovia:travelogue:${tv.id}`,
    version: tv.version,
    save: ({ patch, version, force }) => saveTravelogue({ id: tv.id, version, force, patch }),
  });
  const [overrides, setOverrides] = useState<Partial<TravP>>({});
  const [formGen, setFormGen] = useState(0);
  const initial: TravP = {
    title: tv.title, subtitle: tv.subtitle, purpose: tv.purpose, summary: tv.summary,
    coverMediaId: tv.coverMediaId, ordering: tv.ordering, status: tv.status, ...overrides,
  };
  const [ordering, setOrdering] = useState(initial.ordering);
  const [orderingBusy, startOrdering] = useTransition();
  const view = statusView<TravP, typeof autosave>(autosave, (b) => {
    setOverrides((o) => ({ ...o, ...b }));
    if (b.ordering) setOrdering(b.ordering);
    setFormGen((g) => g + 1);
  });

  const entries = useMemo(() => orderEntries(tv.entries, ordering), [tv.entries, ordering]);
  const points: EntryPoint[] = useMemo(() => entries.flatMap((e, i) =>
    e.lat !== null && e.lng !== null ? [{ id: e.id, n: i + 1, lat: e.lat, lng: e.lng, label: entryLabel(e) }] : []), [entries]);

  const [focus, setFocus] = useState<MapFocus>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const mapView = useMapExpand();

  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function focusEntry(id: string) {
    setHighlighted(id);
    setFocus((f) => ({ id, nonce: (f?.nonce ?? 0) + 1 }));
    if (isMobileViewport()) {
      setMapOpen(true);
      requestAnimationFrame(() => document.getElementById("tl-map")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  function selectFromMap(id: string) {
    setHighlighted(id);
    if (mapView.expanded) mapView.collapse();
    requestAnimationFrame(() => document.getElementById(`entry-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function changeOrdering(o: "chronological" | "manual", currentIds: string[]) {
    setOrdering(o);
    autosave.update({ ordering: o });
    startOrdering(async () => {
      const ok = await autosave.flush();
      // Elle sıralamaya geçerken mevcut (kronolojik) sıra başlangıç noktası olsun
      if (ok && o === "manual") {
        const r = await reorderTravelogue(tv.id, "entries", currentIds);
        if (!r.ok) setError(r.message);
      }
    });
  }

  const ctx = { media: tv.media, userId, tripId: tv.trip?.id ?? null, onReload, onMediaUploaded: () => router.refresh() };

  return (
    <div className="relative flex flex-col lg:grid lg:h-dvh lg:overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(22rem,42%)] lg:grid-rows-[auto_minmax(0,1fr)]" data-testid="travelogue-workspace" data-ready={hydrated || undefined}>
      <header className="space-y-2 border-b border-sand-200 bg-paper px-4 py-4 sm:px-6 lg:col-start-1 lg:row-start-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/seyahatnameler" className="inline-flex items-center gap-1 text-sm font-semibold text-stone-600 hover:text-ink-900">
            <ArrowLeft className="size-4" aria-hidden /> {T.back}
          </Link>
          <SaveStatus autosave={view} onReload={onReload} />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">{t.nav.travelogues}</p>
            <h1 className="truncate font-serif text-2xl font-bold" data-testid="workspace-title">{tv.title}</h1>
          </div>
          <ButtonLink href={`/seyahatnameler/${tv.id}/oku`} size="sm" variant="primary" data-testid="read-link">
            <BookOpen className="size-4" aria-hidden /> {T.read}
          </ButtonLink>
        </div>
        <button type="button" onClick={() => setMapOpen((v) => !v)} aria-expanded={mapOpen} aria-controls="tl-map"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-800 underline underline-offset-2 lg:hidden">
          <MapIcon className="size-4" aria-hidden /> {mapOpen ? T.mapHide : T.mapShow}
        </button>
      </header>

      <div id="tl-map" className={cn("scroll-mt-[var(--mobile-header)] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:h-full lg:border-l lg:border-sand-200",
        mapOpen ? "block" : "hidden")}>
        <MapFrame expanded={mapView.expanded} onExpand={mapView.expand} onCollapse={mapView.collapse} className="h-[38vh] w-full lg:h-full">
          <TravelogueMap styleUrl={styleUrl} polyline={tv.trip?.polyline ?? null} points={points} focus={focus}
            highlightedId={highlighted} onSelect={selectFromMap} className="h-full w-full" />
          {points.length === 0 && (
            <p className="pointer-events-none absolute inset-x-3 bottom-8 z-10 rounded-xl bg-paper/90 px-3 py-2 text-center text-xs text-stone-700 shadow">{T.mapEmpty}</p>
          )}
        </MapFrame>
      </div>

      <div className="relative space-y-8 bg-paper px-4 py-6 sm:px-6 lg:col-start-1 lg:row-start-2 lg:overflow-y-auto">
        <section aria-labelledby="cover-title" className="space-y-3">
          <h2 id="cover-title" className="text-lg font-extrabold tracking-tight">{T.cover}</h2>
          {tv.trip && (
            <p className="flex items-center gap-1.5 text-sm text-stone-700">
              <Route className="size-4 text-amber-600" aria-hidden /> {T.trip}:
              <Link href={`/yolculuklar/${tv.trip.id}`} className="font-semibold underline-offset-2 hover:underline" title={T.tripLink}>{tv.trip.title}</Link>
            </p>
          )}
          <CoverForm key={formGen} initial={initial} media={tv.media} onPatch={(p) => autosave.update(p)} />
        </section>

        <SectionsPanel travelogueId={tv.id} sections={tv.sections} ctx={ctx} />

        <EntriesPanel travelogueId={tv.id} entries={entries} ordering={ordering} onOrdering={changeOrdering}
          highlightedId={highlighted} onFocusMap={focusEntry} />
        {orderingBusy && <p className="sr-only" role="status">{t.common.saving}</p>}

        <section className="space-y-2 border-t border-sand-200 pt-6">
          {error && <Alert tone="error">{error}</Alert>}
          {confirming ? (
            <div className="card space-y-3 p-4" role="alertdialog" aria-labelledby="tl-del">
              <p id="tl-del" className="text-sm font-semibold">{T.deleteConfirm}</p>
              <p className="text-sm text-stone-600">{T.deleteNote}</p>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>{t.common.cancel}</Button>
                <Button type="button" size="sm" variant="danger" disabled={deleting} data-testid="travelogue-delete-confirm"
                  onClick={() => startDelete(async () => {
                    setError(null);
                    const r = await deleteTravelogue(tv.id);
                    if (r.ok) router.replace("/seyahatnameler");
                    else { setError(r.message); setConfirming(false); }
                  })}>{T.deleteYes}</Button>
              </div>
            </div>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} data-testid="travelogue-delete">
              <Trash2 className="size-4" aria-hidden /> {T.delete}
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
