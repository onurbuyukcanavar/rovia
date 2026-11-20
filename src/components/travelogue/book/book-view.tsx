import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { DocView } from "@/components/travelogue/doc-view";
import { BookMap } from "./book-map";
import { mapStyleUrl } from "@/lib/env";
import type { MediaItem } from "@/lib/journal/types";
import type { Travelogue } from "@/lib/travelogue/types";
import { buildBook, formatVisit, type BookEntry, type BookPhoto, type BookSection } from "@/lib/travelogue/pdf/model";
import { t } from "@/i18n";

const L = t.travelogue.book;

/** Bütünleşik seyahatname: görünür bölümler sırasıyla, kitap düzeninde (salt okunur). */
export function BookView({ travelogue }: { travelogue: Travelogue }) {
  const model = buildBook(travelogue);
  const styleUrl = mapStyleUrl();
  const hasCover = model.sections.some((s) => s.kind === "cover");
  return (
    <article className="mx-auto w-full max-w-3xl pb-24 font-serif text-ink-900" data-testid="book-view">
      {!hasCover && (
        <header className="px-5 pt-10 pb-4 sm:px-10">
          <h1 className="text-4xl leading-tight font-semibold text-balance">{model.title}</h1>
          {model.subtitle && <p className="mt-2 text-xl text-stone-600 italic">{model.subtitle}</p>}
        </header>
      )}
      {model.sections.length === 0 && <p className="px-5 py-10 font-sans text-stone-600 sm:px-10">{L.empty}</p>}
      {model.sections.map((sec) => (
        <Section key={sec.id} sec={sec} media={model.media} styleUrl={styleUrl} />
      ))}
    </article>
  );
}

function Section({ sec, media, styleUrl }: { sec: BookSection; media: Map<string, MediaItem>; styleUrl: string }) {
  if (sec.kind === "cover") return <Cover sec={sec} media={media} />;
  let body: ReactNode = null;
  switch (sec.kind) {
    case "text":
      body = (
        <>
          {sec.purpose && <Labeled label={L.purpose}><p className="text-xl leading-relaxed">{sec.purpose}</p></Labeled>}
          {sec.summary && <Labeled label={L.summary}><p className="text-lg leading-relaxed whitespace-pre-line">{sec.summary}</p></Labeled>}
          {sec.content && <DocView doc={sec.content} media={media} className="text-lg leading-relaxed" />}
        </>
      );
      break;
    case "trip_info":
      body = (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          {sec.facts.map((f) => (
            <div key={f.key} className="border-t border-sand-300 pt-2">
              <dt className="font-sans text-[0.7rem] font-bold tracking-widest text-stone-600 uppercase">{f.label}</dt>
              <dd className="mt-1 text-2xl">{f.value}</dd>
            </div>
          ))}
        </dl>
      );
      break;
    case "map":
      body = (
        <>
          <BookMap styleUrl={styleUrl} paths={sec.paths} markers={sec.markers} />
          {sec.markers.length > 0 && (
            <ol className="mt-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-base sm:grid-cols-2">
              {sec.markers.map((m) => (
                <li key={m.number} className="flex items-center gap-2">
                  <Badge n={m.number} small />
                  <a href={`#${m.anchor}`} className="hover:text-amber-700 hover:underline">{m.title}</a>
                </li>
              ))}
            </ol>
          )}
        </>
      );
      break;
    case "chronicle":
      body = <div className="space-y-20">{sec.entries.map((be) => <Chapter key={be.anchor} be={be} media={media} />)}</div>;
      break;
    case "places":
      body = (
        <ol className="divide-y divide-sand-200 border-y border-sand-200">
          {sec.entries.map((be) => {
            const e = be.entry;
            const meta = [e.locationName?.trim() && e.locationName.trim() !== be.title ? e.locationName.trim() : null, formatVisit(e.visitedAt)].filter(Boolean).join(" · ");
            return (
              <li key={be.anchor} className="flex gap-3 py-3">
                <Badge n={be.number} />
                <div className="min-w-0 flex-1">
                  <a href={`#${be.anchor}`} className="text-lg font-semibold hover:text-amber-700">{be.title}</a>
                  {meta && <p className="font-sans text-sm text-stone-600">{meta}</p>}
                  {e.address?.trim() && <p className="font-sans text-sm text-stone-500">{e.address.trim()}</p>}
                  <Tags tags={e.tags} />
                </div>
              </li>
            );
          })}
        </ol>
      );
      break;
    case "gallery":
      body = <PhotoGrid photos={sec.photos} media={media} />;
      break;
  }
  return (
    <section id={`bolum-${sec.id}`} className="scroll-mt-20 border-t border-sand-200 px-5 py-14 first:border-t-0 sm:px-10">
      <h2 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl">{sec.title}</h2>
      <div className="mt-3 mb-8 h-0.5 w-11 bg-amber-500" aria-hidden />
      {body}
    </section>
  );
}

function Cover({ sec, media }: { sec: Extract<BookSection, { kind: "cover" }>; media: Map<string, MediaItem> }) {
  const photo = sec.coverMediaId ? media.get(sec.coverMediaId) : undefined;
  return (
    <header className="relative isolate overflow-hidden bg-ink-900 text-paper sm:mt-6 sm:rounded-2xl" data-testid="book-cover">
      {photo?.url && (
        /* eslint-disable-next-line @next/next/no-img-element -- imzalı Storage bağlantısı */
        <img src={photo.url} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/90 via-ink-950/45 to-ink-950/10" aria-hidden />
      <div className="flex min-h-[70vh] flex-col justify-between px-6 py-8 sm:min-h-[36rem] sm:px-10 sm:py-10">
        <p className="flex items-center gap-2 font-sans text-xs font-bold tracking-[0.3em]">
          {/* eslint-disable-next-line @next/next/no-img-element -- küçük SVG logo */}
          <img src="/icon.svg" alt="" className="size-6 rounded-md" /> {L.brand}
        </p>
        <div>
          <div className="mb-5 h-0.5 w-11 bg-amber-500" aria-hidden />
          <h1 className="text-4xl leading-[1.08] font-semibold text-balance text-white sm:text-6xl">{sec.title}</h1>
          {sec.subtitle && <p className="mt-3 text-lg text-sand-100 italic sm:text-2xl">{sec.subtitle}</p>}
          {sec.route && <p className="mt-6 font-sans text-sm font-bold tracking-wide text-amber-300">{sec.route}</p>}
          {sec.dateRange && <p className="mt-1 font-sans text-sm text-sand-200">{sec.dateRange}</p>}
        </div>
      </div>
    </header>
  );
}

function Chapter({ be, media }: { be: BookEntry; media: Map<string, MediaItem> }) {
  const e = be.entry;
  const meta = [formatVisit(e.visitedAt), e.locationName?.trim() && e.locationName.trim() !== be.title ? e.locationName.trim() : null].filter(Boolean).join(" · ");
  return (
    <section id={be.anchor} className="scroll-mt-20" data-testid="book-chapter">
      <p className="font-sans text-[0.7rem] font-bold tracking-[0.18em] text-amber-700 uppercase">{L.chapter(be.number)}</p>
      <h3 className="mt-1 text-3xl leading-tight font-semibold text-balance">{be.title}</h3>
      {meta && <p className="mt-2 font-sans text-sm text-stone-600">{meta}</p>}
      {e.address?.trim() && <p className="font-sans text-sm text-stone-500">{e.address.trim()}</p>}
      <Tags tags={e.tags} />
      <div className="mt-6 space-y-8">
        {be.fields.map((f) => (
          <Labeled key={f.key} label={f.label}>
            <DocView doc={f.doc} media={media} className="text-lg leading-relaxed" />
          </Labeled>
        ))}
      </div>
      {be.photos.length > 0 && <div className="mt-8"><PhotoGrid photos={be.photos} media={media} /></div>}
      {e.aiAssisted && (
        <p className="mt-6 inline-flex items-center gap-1.5 font-sans text-xs text-stone-500">
          <Sparkles className="size-3.5" aria-hidden /> {L.aiAssisted}
        </p>
      )}
    </section>
  );
}

function PhotoGrid({ photos, media }: { photos: BookPhoto[]; media: Map<string, MediaItem> }) {
  const single = photos.length === 1;
  return (
    <div className={single ? "" : "grid grid-cols-1 gap-5 sm:grid-cols-2"}>
      {photos.map((p) => {
        const m = media.get(p.mediaId);
        if (!m?.url) return null;
        return (
          <figure key={p.mediaId} className="m-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- imzalı Storage bağlantısı */}
            <img
              src={single ? m.url : (m.thumbUrl ?? m.url)}
              alt={p.caption ?? ""}
              width={m.width ?? undefined}
              height={m.height ?? undefined}
              loading="lazy"
              className={single ? "h-auto max-h-[75vh] w-full rounded-lg object-contain" : "aspect-[4/3] w-full rounded-lg object-cover"}
            />
            {p.caption && <figcaption className="mt-2 text-center text-sm text-stone-600 italic">{p.caption}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <h4 className="mb-2 font-sans text-[0.7rem] font-bold tracking-[0.15em] text-stone-600 uppercase">{label}</h4>
      {children}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5 font-sans">
      {tags.map((tag) => (
        <li key={tag} className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{tag}</li>
      ))}
    </ul>
  );
}

function Badge({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-amber-500 font-sans font-bold text-ink-950 ${small ? "size-5 text-[0.65rem]" : "size-7 text-xs"}`}>
      {n}
    </span>
  );
}
