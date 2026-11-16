"use client";
import { Bookmark, Check, Heart, LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { savePlaces } from "@/lib/actions/favorites";
import type { FavoriteStopItem, ListType } from "@/lib/favorites/types";
import type { FoundPlace } from "@/lib/maps/types";
import { normalizeForSearch } from "@/lib/places/normalize";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const OSM_REF = /^[nwr][0-9]{1,19}$/;

/** Haritadaki yer ayrıntısında: "Favorilere ekle" ve "Daha sonra git". */
export function FavoriteActions({ place, saved, onSaved }: { place: FoundPlace; saved: ListType | null; onSaved: (list: ListType) => void }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  function save(listType: ListType) {
    setMessage(null);
    start(async () => {
      const r = await savePlaces({
        source: "explore",
        items: [{
          name: place.name, lat: place.location.lat, lng: place.location.lng, address: place.address,
          osmRef: OSM_REF.test(place.id) ? place.id : null, listType,
        }],
      });
      if (!r.ok) {
        setMessage({ tone: "error", text: r.message });
        return;
      }
      const res = r.results[0];
      if (res?.status === "imported") {
        onSaved(listType);
        setMessage({ tone: "success", text: listType === "favorite" ? t.favorites.added : t.favorites.addedWantToGo });
      } else if (res?.status === "duplicate") {
        onSaved(listType);
        setMessage({ tone: "info", text: t.favorites.alreadySaved });
      } else setMessage({ tone: "error", text: t.favorites.errors.invalid });
    });
  }

  return (
    <div className="space-y-2" data-testid="favorite-actions">
      {saved ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <Check className="size-4" aria-hidden /> {t.favorites.savedState(t.favorites.lists[saved])}
          <Link href="/favoriler" className="font-normal text-stone-600 underline">{t.favorites.title}</Link>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="accent" size="sm" disabled={pending} onClick={() => save("favorite")}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Heart className="size-4" aria-hidden />} {t.favorites.addToFavorites}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => save("want_to_go")}>
            <Bookmark className="size-4" aria-hidden /> {t.favorites.saveForLater}
          </Button>
        </div>
      )}
      {message && message.tone !== "success" && <Alert tone={message.tone}>{message.text}</Alert>}
      {message?.tone === "success" && <p className="sr-only" role="status">{message.text}</p>}
    </div>
  );
}

export { favoriteToStopServer as favoriteToStop } from "@/lib/favorites/stop";

/** Planlayıcıda: favori yerlerden durak seçme. */
export function FavoritePicker({ favorites, onPick, disabled }: { favorites: FavoriteStopItem[]; onPick: (f: FavoriteStopItem) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = normalizeForSearch(query);
    return (q ? favorites.filter((f) => normalizeForSearch(`${f.name} ${f.address ?? ""}`).includes(q)) : favorites).slice(0, 50);
  }, [favorites, query]);

  return (
    <details className="rounded-2xl border border-sand-200 bg-paper-50" open={open} onToggle={(e) => setOpen(e.currentTarget.open)} data-testid="favorite-picker">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
        <Heart className="size-4 text-amber-600" aria-hidden /> {t.favorites.fromFavorites}
        <span className="ml-auto text-xs font-normal text-stone-500 tabular-nums">{favorites.length}</span>
      </summary>
      <div className="space-y-2 px-4 pb-4">
        {favorites.length === 0 ? (
          <p className="text-sm text-stone-600">{t.favorites.fromFavoritesEmpty}</p>
        ) : (
          <>
            {favorites.length > 8 && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-500" aria-hidden />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t.favorites.searchInList}
                  placeholder={t.favorites.searchInList}
                  className="h-10 w-full rounded-xl border border-sand-300 bg-white pr-3 pl-9 text-sm outline-none focus:border-ink-700" />
              </div>
            )}
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {shown.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-white">
                  <span className={cn("size-2.5 shrink-0 rounded-full", f.listType === "want_to_go" ? "bg-[#1d3557]" : "bg-amber-500")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.name}</span>
                    {f.address && <span className="block truncate text-xs text-stone-600">{f.address}</span>}
                  </span>
                  <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onPick(f)}
                    aria-label={`${f.name}: ${t.favorites.addAsStop}`}>
                    {t.favorites.addAsStop}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
