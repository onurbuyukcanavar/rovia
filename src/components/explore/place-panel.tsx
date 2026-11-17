"use client";
import { ArrowLeft, BookOpen, CalendarPlus, Clock3, Database, ExternalLink, Globe, Info, MapPin, Mountain, Route } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CATEGORY_COLORS, type ExploreCategory } from "@/lib/explore/categories";
import { osmUrl, safeUrl, wikidataUrl, wikipediaUrl } from "@/lib/explore/geo";
import { placeToSearchParams } from "@/lib/explore/place-param";
import type { ExplorePlace } from "@/lib/explore/types";
import { ButtonLink } from "@/components/ui/button";
import { fieldClass } from "@/components/journal/note-editor";
import { AddToTravelogue } from "@/components/travelogue/add-to-travelogue";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";
import { CATEGORY_ICONS } from "./category-chips";

const T = t.explore.place;

type Props = {
  place: ExplorePlace;
  category: ExploreCategory;
  /** "x km sonra · rotaya y" ya da "sana z uzaklıkta" */
  distanceText: string | null;
  plannedTrips: { id: string; title: string }[];
  favoriteActions: ReactNode;
  onBack: () => void;
};

/** Seçili keşif yeri: nötr OSM bilgileri, her zaman görünen kaynak bilgisi ve eylemler. */
export function PlacePanel({ place, category, distanceText, plannedTrips, favoriteActions, onBack }: Props) {
  const tags = place.tags;
  const Icon = CATEGORY_ICONS[category];
  const website = safeUrl(tags.website ?? tags["contact:website"] ?? tags.url);
  const wiki = wikipediaUrl(tags.wikipedia);
  const wikidata = wikidataUrl(tags.wikidata);
  const osm = osmUrl(place.id);
  const description = tags["description:tr"] ?? tags.description;
  const ele = tags.ele && /^-?\d+(\.\d+)?$/.test(tags.ele.trim()) ? Math.round(Number(tags.ele)) : null;
  const hasInfo = Boolean(description || ele !== null || tags.opening_hours || website);
  const params = placeToSearchParams({ ref: place.id, name: place.name, lat: place.location.lat, lng: place.location.lng, address: place.admin });

  return (
    <article aria-labelledby="explore-place-title" className="space-y-4" data-testid="explore-place">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 hover:text-ink-900">
        <ArrowLeft className="size-4" aria-hidden /> {T.back}
      </button>

      <header className="space-y-1">
        <p className="eyebrow flex items-center gap-1.5">
          <Icon className="size-3.5" style={{ color: CATEGORY_COLORS[category] }} aria-hidden />
          {[place.typeLabel, t.explore.categories[category]].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
        </p>
        <h2 id="explore-place-title" className="text-xl font-extrabold tracking-tight">{place.name}</h2>
      </header>

      <dl className="space-y-2.5 text-sm">
        {place.admin && (
          <Row icon={MapPin} label={T.admin}>{place.admin}</Row>
        )}
        {distanceText && <Row icon={Route} label={T.distance}><span className="font-semibold">{distanceText}</span></Row>}
        {ele !== null && <Row icon={Mountain} label={T.elevation}>{T.elevation}: {ele.toLocaleString("tr-TR")} m</Row>}
        {tags.opening_hours && (
          <Row icon={Clock3} label={T.hours}>
            <span className="text-stone-500">{T.hours}: </span>
            <span className="break-words">{tags.opening_hours === "24/7" ? "7 gün 24 saat" : tags.opening_hours}</span>
          </Row>
        )}
        {website && (
          <Row icon={Globe} label={T.website}>
            <a href={website.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline-offset-2 hover:underline">{website.hostname}</a>
          </Row>
        )}
      </dl>

      {description && (
        <section className="rounded-2xl border border-dashed border-sand-300 bg-sand-50 p-3 text-sm" data-testid="explore-unverified">
          <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-stone-600 uppercase">
            <Info className="size-3.5" aria-hidden /> {T.osmDescription} · {T.unverified}
          </h3>
          <p className="mt-1.5 break-words whitespace-pre-line">{description.slice(0, 600)}</p>
          <p className="mt-1.5 text-xs text-stone-500">{T.unverifiedNote}</p>
        </section>
      )}
      {!hasInfo && <p className="text-xs text-stone-600">{T.noInfo}</p>}

      {favoriteActions}
      <AddToTravelogue className="w-full"
        place={{ name: place.name, address: place.admin, lat: place.location.lat, lng: place.location.lng, osmRef: place.id }} />
      <AddToTrip params={params} trips={plannedTrips} />

      <section className="space-y-1.5 rounded-2xl border border-sand-200 bg-paper-50 p-3 text-sm" aria-labelledby="explore-source" data-testid="explore-source">
        <h3 id="explore-source" className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-stone-600 uppercase">
          <Database className="size-3.5" aria-hidden /> {T.sourceTitle}
        </h3>
        <p>
          {T.sourceTitle}: {T.sourceOsm}
          {osm && (
            <>
              {" · "}
              <a href={osm} target="_blank" rel="noopener noreferrer" data-testid="explore-osm-link"
                className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline">
                {T.sourceOsmLink} <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </p>
        {(wiki || wikidata) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-stone-500">{T.sourceWiki}:</span>
            {wiki && (
              <a href={wiki} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline">
                <BookOpen className="size-3.5" aria-hidden /> {T.wikipedia}
              </a>
            )}
            {wikidata && (
              <a href={wikidata} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:underline">
                {T.wikidata} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </p>
        )}
        <p className="text-xs text-stone-500">{T.sourceNote}</p>
      </section>
    </article>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <dt className="sr-only">{label}</dt>
      <Icon className="mt-0.5 size-4 shrink-0 text-stone-500" aria-hidden />
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** "Yolculuğa ekle": planlanmış yolculuğu planlayıcıda bu yer eklenmiş olarak açar (kayıt kullanıcıda). */
function AddToTrip({ params, trips }: { params: string; trips: { id: string; title: string }[] }) {
  const A = t.explore.addToTrip;
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  return (
    <section className="space-y-2 rounded-2xl border border-ink-900/15 bg-ink-900/[0.03] p-3" aria-labelledby="explore-add-trip" data-testid="explore-add-trip">
      <h3 id="explore-add-trip" className="flex items-center gap-1.5 text-sm font-bold"><CalendarPlus className="size-4" aria-hidden /> {A.title}</h3>
      {trips.length > 0 ? (
        <>
          <p className="text-xs text-stone-600">{A.body}</p>
          <label className="block">
            <span className="sr-only">{A.select}</span>
            <select className={cn(fieldClass, "h-10 text-sm")} value={tripId} onChange={(e) => setTripId(e.target.value)} aria-label={A.select}>
              {trips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
            </select>
          </label>
          <ButtonLink href={`/planla/${tripId}?${params}`} size="sm" className="w-full" aria-disabled={!tripId}>{A.add}</ButtonLink>
          <ButtonLink href={`/planla?${params}`} size="sm" variant="ghost" className="w-full">{A.newPlan}</ButtonLink>
        </>
      ) : (
        <>
          <p className="text-xs text-stone-600">{A.noTrips}</p>
          <ButtonLink href={`/planla?${params}`} size="sm" variant="secondary" className="w-full">{A.newPlan}</ButtonLink>
        </>
      )}
    </section>
  );
}
