"use client";
import { Check, Download, LoaderCircle, MapPin, Pencil, Plus, Search, Signpost, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { AddToTravelogue } from "@/components/travelogue/add-to-travelogue";
import { deleteFavorites, updateFavorite } from "@/lib/actions/favorites";
import { FAVORITE_CATEGORIES, isGoogleSource, type Favorite, type FavoriteCategory, type ListType } from "@/lib/favorites/types";
import { normalizeForSearch } from "@/lib/places/normalize";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { AddPlacePanel, candidateFromPoint, inputClass, ListTypeToggle, type Candidate } from "./add-place-panel";
import { FavoritesMap } from "./favorites-map";
import { MapFrame, isMobileViewport, useMapExpand } from "@/components/map/map-frame";

type ListFilter = "all" | ListType;
type SourceFilter = "all" | "rovia" | "google";

const RENDER_LIMIT = 300;

export function FavoritesView({ styleUrl, places }: { styleUrl: string; places: Favorite[] }) {
  const [list, setList] = useState<ListFilter>("all");
  const [category, setCategory] = useState<"all" | FavoriteCategory>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mapView = useMapExpand();

  const filtered = useMemo(() => {
    const q = normalizeForSearch(query);
    return places.filter(
      (p) =>
        (list === "all" || p.listType === list) &&
        (category === "all" || p.category === category) &&
        (source === "all" || (source === "google") === isGoogleSource(p.source)) &&
        (!q || normalizeForSearch(`${p.name} ${p.address ?? ""} ${p.listName ?? ""} ${p.notes ?? ""}`).includes(q)),
    );
  }, [places, list, category, source, query]);

  const counts = useMemo(() => ({
    all: places.length,
    favorite: places.filter((p) => p.listType === "favorite").length,
    want_to_go: places.filter((p) => p.listType === "want_to_go").length,
  }), [places]);

  function closeAdd() {
    setAdding(false);
    setCandidate(null);
  }

  return (
    <div className="flex h-app-mobile flex-col lg:grid lg:h-dvh lg:grid-cols-[28rem_1fr] relative lg:overflow-hidden">
      <MapFrame expanded={mapView.expanded} onExpand={mapView.expand} onCollapse={mapView.collapse}
        className="order-1 h-[45%] shrink-0 lg:order-2 lg:h-full">
        <FavoritesMap styleUrl={styleUrl} places={filtered} selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            // Tam ekranda bir yere dokunulunca listede ayrıntısı açılsın
            if (id && mapView.expanded) mapView.collapse();
          }}
          onBackgroundTap={() => { if (!mapView.expanded && isMobileViewport()) mapView.expand(); }}
          candidate={adding && candidate ? { lat: candidate.lat, lng: candidate.lng } : null}
          picking={adding} onPick={(p) => {
            setCandidate(candidateFromPoint(p));
            if (mapView.expanded) mapView.collapse();
          }} />
      </MapFrame>

      <aside className="order-2 min-h-0 flex-1 overflow-y-auto border-t border-sand-200 bg-paper px-4 py-4 lg:order-1 lg:border-t-0 lg:border-r lg:px-5 lg:py-6">
        {adding ? (
          <AddPlacePanel candidate={candidate} onCandidate={setCandidate} onClose={closeAdd}
            onSaved={(id, message) => {
              closeAdd();
              setNotice(message);
              setList("all");
              setCategory("all");
              setSource("all");
              setQuery("");
              setSelectedId(id);
            }} />
        ) : (
          <div className="space-y-5">
            <header className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight">{t.favorites.title}</h1>
              <p className="text-sm text-stone-600">{t.favorites.subtitle}</p>
            </header>
            <div className="flex gap-2">
              <Button type="button" variant="accent" size="sm" onClick={() => { setNotice(null); setAdding(true); }}>
                <Plus className="size-4" aria-hidden /> {t.favorites.add}
              </Button>
              <ButtonLink href="/favoriler/ice-aktar" variant="secondary" size="sm">
                <Download className="size-4" aria-hidden /> {t.favorites.import}
              </ButtonLink>
            </div>
            {notice && <Alert tone="success">{notice}</Alert>}

            <div className="space-y-3" role="group" aria-label={t.favorites.filters}>
              <div className="flex gap-1 rounded-full bg-sand-100 p-1" role="tablist" aria-label={t.favorites.listType}>
                {(["all", "favorite", "want_to_go"] as const).map((v) => (
                  <button key={v} type="button" role="tab" aria-selected={list === v} onClick={() => setList(v)}
                    className={cn("flex-1 rounded-full px-2 py-1.5 text-xs font-semibold sm:text-sm", list === v ? "bg-white text-ink-900 shadow-sm" : "text-stone-600 hover:text-ink-900")}>
                    {t.favorites.lists[v]} <span className="tabular-nums opacity-70">{counts[v]}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select aria-label={t.favorites.category} className={cn(inputClass, "h-10 text-sm")} value={category}
                  onChange={(e) => setCategory(e.target.value as typeof category)}>
                  <option value="all">{t.favorites.allCategories}</option>
                  {FAVORITE_CATEGORIES.map((c) => <option key={c} value={c}>{t.favorites.categories[c]}</option>)}
                </select>
                <select aria-label={t.favorites.source} className={cn(inputClass, "h-10 text-sm")} value={source}
                  onChange={(e) => setSource(e.target.value as SourceFilter)}>
                  {(["all", "rovia", "google"] as const).map((s) => <option key={s} value={s}>{t.favorites.sources[s]}</option>)}
                </select>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-500" aria-hidden />
                <input type="search" aria-label={t.favorites.searchInList} placeholder={t.favorites.searchInList}
                  className={cn(inputClass, "h-10 pl-9 text-sm")} value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>

            {places.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-sand-300 p-6 text-center text-sm text-stone-600" data-testid="favorites-empty">{t.favorites.empty}</p>
            ) : filtered.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-sand-300 p-6 text-center text-sm text-stone-600">{t.favorites.emptyFiltered}</p>
            ) : (
              <>
                <p className="text-sm text-stone-600" aria-live="polite" data-testid="favorites-count">{t.favorites.count(filtered.length)}</p>
                <ul className="space-y-2" data-testid="favorites-list">
                  {filtered.slice(0, RENDER_LIMIT).map((p) => (
                    <FavoriteRow key={p.id} place={p} selected={p.id === selectedId}
                      onSelect={() => setSelectedId(p.id === selectedId ? null : p.id)}
                      onDeleted={() => { setSelectedId(null); setNotice(t.favorites.deleted); }} />
                  ))}
                </ul>
                {filtered.length > RENDER_LIMIT && <p className="text-xs text-stone-500">{t.favorites.moreHidden(filtered.length - RENDER_LIMIT)}</p>}
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function FavoriteRow({ place, selected, onSelect, onDeleted }: { place: Favorite; selected: boolean; onSelect: () => void; onDeleted: () => void }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const google = isGoogleSource(place.source);
  const ref = useRef<HTMLLIElement>(null);
  // Haritadan seçilince listede görünür olsun
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  function remove() {
    setError(null);
    start(async () => {
      const r = await deleteFavorites([place.id]);
      if (!r.ok) setError(r.message);
      else onDeleted();
    });
  }

  return (
    <li ref={ref} className={cn("scroll-mt-4 rounded-2xl border bg-white transition", selected ? "border-ink-900 shadow-md" : "border-sand-200")} data-testid="favorite-row">
      <button type="button" onClick={onSelect} aria-expanded={selected} className="flex w-full items-start gap-3 p-3 text-left">
        <span className={cn("mt-1 size-3 shrink-0 rounded-full border-2 border-white shadow", place.listType === "want_to_go" ? "bg-[#1d3557]" : "bg-amber-500")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{place.name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-600">
            <span>{t.favorites.categories[place.category]}</span>
            {place.address && <span className="truncate">· {place.address}</span>}
          </span>
        </span>
        <Badge className={cn("shrink-0", google && "bg-sky-100 text-sky-800")}>{t.favorites.sourceBadge[place.source] ?? place.source}</Badge>
      </button>

      {selected && !editing && (
        <div className="space-y-3 border-t border-sand-100 px-3 pt-3 pb-3">
          {place.listName && <p className="text-xs text-stone-600">{t.favorites.fromList(place.listName)}</p>}
          {place.notes && <p className="text-sm whitespace-pre-line text-ink-800">{place.notes}</p>}
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/planla?hedef=${place.id}`} size="sm" variant="primary">
              <Signpost className="size-4" aria-hidden /> {t.favorites.planTrip}
            </ButtonLink>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> {t.favorites.edit}
            </Button>
            <AddToTravelogue place={{ name: place.name, address: place.address, lat: place.lat, lng: place.lng, osmRef: place.osmRef, savedPlaceId: place.id }} />
            {confirming ? (
              <span className="inline-flex items-center gap-2">
                <span className="text-sm font-semibold">{t.favorites.deleteConfirm}</span>
                <Button type="button" size="sm" variant="danger" onClick={remove} disabled={pending}>
                  {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} {t.favorites.deleteYes}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)} aria-label={t.common.cancel}>
                  <X className="size-4" aria-hidden />
                </Button>
              </span>
            ) : (
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                <Trash2 className="size-4" aria-hidden /> {t.favorites.delete}
              </Button>
            )}
          </div>
          <Link href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=17/${place.lat}/${place.lng}`}
            target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-stone-500 underline">
            <MapPin className="size-3" aria-hidden /> {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
          </Link>
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
      {selected && editing && <EditForm place={place} onDone={() => setEditing(false)} />}
    </li>
  );
}

function EditForm({ place, onDone }: { place: Favorite; onDone: () => void }) {
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState<FavoriteCategory>(place.category);
  const [listType, setListType] = useState<ListType>(place.listType);
  const [notes, setNotes] = useState(place.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const r = await updateFavorite({ id: place.id, name, category, listType, notes: notes.trim() || null });
      if (!r.ok) setError(r.message);
      else onDone();
    });
  }

  return (
    <form className="space-y-3 border-t border-sand-100 p-3" onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="favorite-edit">
      <div className="space-y-1.5">
        <label htmlFor={`f-name-${place.id}`} className="block text-sm font-semibold text-ink-800">{t.favorites.name}</label>
        <input id={`f-name-${place.id}`} className={inputClass} value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
      </div>
      <ListTypeToggle value={listType} onChange={setListType} />
      <div className="space-y-1.5">
        <label htmlFor={`f-cat-${place.id}`} className="block text-sm font-semibold text-ink-800">{t.favorites.category}</label>
        <select id={`f-cat-${place.id}`} className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as FavoriteCategory)}>
          {FAVORITE_CATEGORIES.map((c) => <option key={c} value={c}>{t.favorites.categories[c]}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`f-notes-${place.id}`} className="block text-sm font-semibold text-ink-800">{t.favorites.notes}</label>
        <textarea id={`f-notes-${place.id}`} rows={3} maxLength={5000} value={notes} placeholder={t.favorites.notesPlaceholder}
          onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, "h-auto py-2")} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="accent" disabled={pending || !name.trim()}>
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />} {t.favorites.save}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>{t.common.cancel}</Button>
      </div>
    </form>
  );
}
