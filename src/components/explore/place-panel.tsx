"use client";
import { ArrowLeft, BookOpen, CalendarPlus, Clock3, Database, ExternalLink, Globe, Info, MapPin, Mountain, Route } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CATEGORY_COLORS, type ExploreCategory } from "@/lib/explore/categories";
import { cityOf, osmUrl, safeUrl, tripadvisorUrl, wikidataUrl, wikipediaUrl } from "@/lib/explore/geo";
import { placeToSearchParams } from "@/lib/explore/place-param";
import type { ExplorePlace } from "@/lib/explore/types";
import { ButtonLink } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { AddToTravelogue } from "@/components/travelogue/add-to-travelogue";
import { t } from "@/i18n";
import { CATEGORY_ICONS } from "./category-chips";
import { TripadvisorLink, WikiSection } from "./wiki-section";

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
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> {T.back}
      </button>

      <header className="min-w-0 space-y-3">
        <p className="flex min-w-0 items-center gap-2.5 text-xs font-semibold tracking-[0.2em] text-accent-ink uppercase">
          <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: CATEGORY_COLORS[category] }}>
            <Icon className="size-3.5" />
          </span>
          <span className="min-w-0 break-words">{[place.typeLabel, t.explore.categories[category]].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</span>
        </p>
        <h2 id="explore-place-title" className="text-[2rem] leading-[1.08] font-extralight tracking-[-0.03em] break-words text-fg">{place.name}</h2>
      </header>

      <dl className="space-y-2.5 text-sm text-fg">
        {place.admin && (
          <Row icon={MapPin} label={T.admin}>{place.admin}</Row>
        )}
        {distanceText && <Row icon={Route} label={T.distance}><span className="font-semibold text-accent-ink tabular-nums">{distanceText}</span></Row>}
        {ele !== null && <Row icon={Mountain} label={T.elevation}>{T.elevation}: {ele.toLocaleString("tr-TR")} m</Row>}
        {tags.opening_hours && (
          <Row icon={Clock3} label={T.hours}>
            <span className="text-fg-subtle">{T.hours}: </span>
            <span className="break-words">{tags.opening_hours === "24/7" ? "7 gün 24 saat" : tags.opening_hours}</span>
          </Row>
        )}
        {website && (
          <Row icon={Globe} label={T.website}>
            <a href={website.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline-offset-2 hover:underline">{website.hostname}</a>
          </Row>
        )}
      </dl>

      <WikiSection place={place} />

      {description && (
        <section className="rounded-2xl border border-dashed border-line-strong bg-sunken p-3.5 text-sm text-fg" data-testid="explore-unverified">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-fg-muted uppercase">
            <Info className="size-3.5" aria-hidden /> {T.osmDescription} · {T.unverified}
          </h3>
          <p className="mt-1.5 break-words whitespace-pre-line">{description.slice(0, 600)}</p>
          <p className="mt-1.5 text-xs text-fg-subtle">{T.unverifiedNote}</p>
        </section>
      )}
      {!hasInfo && <p className="text-xs text-fg-subtle">{T.noInfo}</p>}
      <TripadvisorLink href={tripadvisorUrl(place.name, cityOf(place.admin))} />

      {favoriteActions}
      <AddToTravelogue className="w-full"
        place={{ name: place.name, address: place.admin, lat: place.location.lat, lng: place.location.lng, osmRef: place.id }} />
      <AddToTrip params={params} trips={plannedTrips} />

      <section className="card space-y-1.5 p-3.5 text-sm text-fg-muted" aria-labelledby="explore-source" data-testid="explore-source">
        <h3 id="explore-source" className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-fg-subtle uppercase">
          <Database className="size-3.5" aria-hidden /> {T.sourceTitle}
        </h3>
        <p>
          {T.sourceTitle}: {T.sourceOsm}
          {osm && (
            <>
              {" · "}
              <a href={osm} target="_blank" rel="noopener noreferrer" data-testid="explore-osm-link"
                className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
                {T.sourceOsmLink} <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </p>
        {(wiki || wikidata) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-fg-subtle">{T.sourceWiki}:</span>
            {wiki && (
              <a href={wiki} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
                <BookOpen className="size-3.5" aria-hidden /> {T.wikipedia}
              </a>
            )}
            {wikidata && (
              <a href={wikidata} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
                {T.wikidata} <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </p>
        )}
        <p className="text-xs text-fg-subtle">{T.sourceNote}</p>
      </section>
    </article>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <dt className="sr-only">{label}</dt>
      <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** "Yolculuğa ekle": planlanmış yolculuğu planlayıcıda bu yer eklenmiş olarak açar (kayıt kullanıcıda). */
function AddToTrip({ params, trips }: { params: string; trips: { id: string; title: string }[] }) {
  const A = t.explore.addToTrip;
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  return (
    <section className="card space-y-2.5 p-4" aria-labelledby="explore-add-trip" data-testid="explore-add-trip">
      <h3 id="explore-add-trip" className="flex items-center gap-2 text-sm font-semibold text-fg"><CalendarPlus className="size-4 text-accent-ink" aria-hidden /> {A.title}</h3>
      {trips.length > 0 ? (
        <>
          <p className="text-xs text-fg-muted">{A.body}</p>
          <label className="block">
            <span className="sr-only">{A.select}</span>
            <select className={inputClass(false, "h-10 px-3 text-sm")} value={tripId} onChange={(e) => setTripId(e.target.value)} aria-label={A.select}>
              {trips.map((tr) => <option key={tr.id} value={tr.id}>{tr.title}</option>)}
            </select>
          </label>
          <ButtonLink href={`/planla/${tripId}?${params}`} size="sm" className="w-full" aria-disabled={!tripId}>{A.add}</ButtonLink>
          <ButtonLink href={`/planla?${params}`} size="sm" variant="ghost" className="w-full">{A.newPlan}</ButtonLink>
        </>
      ) : (
        <>
          <p className="text-xs text-fg-muted">{A.noTrips}</p>
          <ButtonLink href={`/planla?${params}`} size="sm" variant="secondary" className="w-full">{A.newPlan}</ButtonLink>
        </>
      )}
    </section>
  );
}
