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

/**
 * Bütünleşik seyahatname: görünür bölümler sırasıyla, kitap düzeninde (salt okunur).
 * Kitap sayfası her iki temada: serif gövde, rahat satır ölçüsü; geniş ekranda çerçeveli tek sayfa.
 * (PDF dışa aktarma ayrı bir çizimdir: src/lib/travelogue/pdf — bu dosyadaki sınıflar onu etkilemez.)
 */
export function BookView({ travelogue }: { travelogue: Travelogue }) {
  const model = buildBook(travelogue);
  const styleUrl = mapStyleUrl();
  const hasCover = model.sections.some((s) => s.kind === "cover");
  let n = 0;
  return (
    <article
      className="mx-auto w-full max-w-3xl pb-16 font-serif text-fg sm:my-8 sm:overflow-hidden sm:rounded-[var(--radius-card)] sm:border sm:border-line sm:bg-raised sm:pb-20 sm:shadow-[var(--shadow-card)]"
      data-testid="book-view"
    >
      {!hasCover && (
        <header className="px-5 pt-12 pb-6 sm:px-14 sm:pt-16">
          <p className="eyebrow-accent font-sans">{L.brand}</p>
          <h1 className="mt-5 text-[clamp(2.4rem,8vw,3.6rem)] leading-[1.05] font-light tracking-[-0.02em] text-balance">{model.title}</h1>
          {model.subtitle && <p className="mt-3 text-xl text-accent-glow italic sm:text-2xl">{model.subtitle}</p>}
        </header>
      )}
      {model.sections.length === 0 && <p className="px-5 py-10 font-sans text-fg-muted sm:px-14">{L.empty}</p>}
      {model.sections.map((sec) => (
        <Section key={sec.id} sec={sec} index={sec.kind === "cover" ? 0 : ++n} media={model.media} styleUrl={styleUrl} />
      ))}
    </article>
  );
}

/** Bölüm süsü: serif italik numara ve amber çizgi (ana sayfanın numaralı başlıkları). */
function Ornament({ index }: { index: number }) {
  return (
    <p aria-hidden className="flex items-center gap-3">
      <span className="text-xl text-accent-glow italic tabular-nums">{String(index).padStart(2, "0")}</span>
      <span className="h-px w-10 bg-accent/60" />
    </p>
  );
}

function Section({ sec, index, media, styleUrl }: { sec: BookSection; index: number; media: Map<string, MediaItem>; styleUrl: string }) {
  if (sec.kind === "cover") return <Cover sec={sec} media={media} />;
  let body: ReactNode = null;
  switch (sec.kind) {
    case "text":
      body = (
        <>
          {sec.purpose && (
            <Labeled label={L.purpose}>
              <p className="border-l-2 border-accent/70 pl-5 text-[1.35rem] leading-relaxed text-fg italic">{sec.purpose}</p>
            </Labeled>
          )}
          {sec.summary && <Labeled label={L.summary}><p className="text-lg leading-[1.8] whitespace-pre-line text-fg/90">{sec.summary}</p></Labeled>}
          {sec.content && <DocView doc={sec.content} media={media} className="text-lg leading-[1.8]" />}
        </>
      );
      break;
    case "trip_info":
      body = (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:gap-x-10">
          {sec.facts.map((f) => (
            <div key={f.key} className="border-t border-line-strong pt-3">
              <dt className="font-sans text-[0.7rem] font-semibold tracking-[0.2em] text-fg-subtle uppercase">{f.label}</dt>
              <dd className="mt-1.5 text-xl leading-snug font-light tracking-[-0.01em] break-words sm:text-2xl">{f.value}</dd>
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
            <ol className="mt-6 grid grid-cols-1 gap-x-8 gap-y-2 text-base sm:grid-cols-2">
              {sec.markers.map((m) => (
                <li key={m.number} className="flex min-w-0 items-center gap-2.5">
                  <Badge n={m.number} small />
                  <a href={`#${m.anchor}`} className="min-w-0 break-words underline-offset-4 hover:text-accent-ink hover:underline">{m.title}</a>
                </li>
              ))}
            </ol>
          )}
        </>
      );
      break;
    case "chronicle":
      body = (
        <div className="space-y-20">
          {sec.entries.map((be, i) => (
            <div key={be.anchor} className="space-y-20">
              {i > 0 && <Fleuron />}
              <Chapter be={be} media={media} />
            </div>
          ))}
        </div>
      );
      break;
    case "places":
      body = (
        <ol className="divide-y divide-line border-y border-line">
          {sec.entries.map((be) => {
            const e = be.entry;
            const meta = [e.locationName?.trim() && e.locationName.trim() !== be.title ? e.locationName.trim() : null, formatVisit(e.visitedAt)].filter(Boolean).join(" · ");
            return (
              <li key={be.anchor} className="flex gap-4 py-4">
                <Badge n={be.number} />
                <div className="min-w-0 flex-1">
                  <a href={`#${be.anchor}`} className="text-xl leading-snug font-normal break-words underline-offset-4 hover:text-accent-ink hover:underline">{be.title}</a>
                  {meta && <p className="mt-0.5 font-sans text-sm text-fg-muted">{meta}</p>}
                  {e.address?.trim() && <p className="font-sans text-sm text-fg-subtle">{e.address.trim()}</p>}
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
    <section id={`bolum-${sec.id}`} className="scroll-mt-20 border-t border-line px-5 py-14 first:border-t-0 sm:px-14 sm:py-16">
      <Ornament index={index} />
      <h2 className="mt-4 mb-10 text-[clamp(2rem,6.5vw,2.75rem)] leading-[1.08] font-light tracking-[-0.02em] text-balance">{sec.title}</h2>
      {body}
    </section>
  );
}

/** Bölümler arası süs: ◆ (yazı dizgisindeki "fleuron"). */
function Fleuron() {
  return (
    <p aria-hidden className="flex items-center justify-center gap-4 text-accent">
      <span className="h-px w-12 bg-line-strong" />
      <span className="text-[0.7rem]">◆</span>
      <span className="h-px w-12 bg-line-strong" />
    </p>
  );
}

function Cover({ sec, media }: { sec: Extract<BookSection, { kind: "cover" }>; media: Map<string, MediaItem> }) {
  const photo = sec.coverMediaId ? media.get(sec.coverMediaId) : undefined;
  return (
    // Kapak her temada gecedir (fotoğraf/gök üzerinde açık yazı): koyu tema adası
    <header data-theme="dark" className="relative isolate overflow-hidden bg-sunken text-fg" data-testid="book-cover">
      {photo?.url ? (
        /* eslint-disable-next-line @next/next/no-img-element -- imzalı Storage bağlantısı */
        <img src={photo.url} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <CoverSky />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-sunken/95 via-sunken/50 to-sunken/10" aria-hidden />
      <div className="flex min-h-[70vh] flex-col justify-between px-6 py-8 sm:min-h-[36rem] sm:px-14 sm:py-12">
        <p className="flex items-center gap-2.5 font-sans text-xs font-bold tracking-[0.3em]">
          {/* eslint-disable-next-line @next/next/no-img-element -- küçük SVG logo */}
          <img src="/icon.svg" alt="" className="size-6 rounded-md" /> {L.brand}
        </p>
        <div className="[text-shadow:0_2px_24px_var(--color-sunken)]">
          <p aria-hidden className="mb-6 flex items-center gap-3">
            <span className="h-px w-10 bg-accent" />
            <span className="font-sans text-[0.7rem] font-semibold tracking-[0.3em] text-accent-ink uppercase" lang="en">{L.brandTagline}</span>
          </p>
          <h1 className="text-[clamp(2.5rem,10vw,4.5rem)] leading-[1.02] font-light tracking-[-0.025em] text-balance">{sec.title}</h1>
          {sec.subtitle && <p className="mt-4 text-xl text-accent-glow italic sm:text-2xl">{sec.subtitle}</p>}
          {sec.route && <p className="mt-8 font-sans text-sm font-semibold tracking-wide text-fg">{sec.route}</p>}
          {sec.dateRange && <p className="mt-1 font-sans text-sm text-fg-muted">{sec.dateRange}</p>}
        </div>
      </div>
    </header>
  );
}

/** Kapak fotoğrafı yoksa: gece göğü ve ufka uzanan yol (panel karşılamasıyla aynı sahne). */
function CoverSky() {
  return (
    <div aria-hidden className="panel-hero-sky absolute inset-0 -z-10">
      <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full opacity-80">
        <path d="M-300 600 L 396 380 M 1100 600 L 404 380" className="stroke-fg/25" strokeWidth="1.2" fill="none" />
        <path d="M400 600 L 400 380" className="stroke-accent/60" strokeWidth="2" strokeDasharray="16 20" fill="none" />
        <path d="M-200 380 L 1000 380" className="stroke-fg/10" strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
}

function Chapter({ be, media }: { be: BookEntry; media: Map<string, MediaItem> }) {
  const e = be.entry;
  const meta = [formatVisit(e.visitedAt), e.locationName?.trim() && e.locationName.trim() !== be.title ? e.locationName.trim() : null].filter(Boolean).join(" · ");
  return (
    <section id={be.anchor} className="scroll-mt-20" data-testid="book-chapter">
      <p className="eyebrow-accent font-sans">{L.chapter(be.number)}</p>
      <h3 className="mt-3 text-[clamp(1.75rem,5.5vw,2.25rem)] leading-tight font-normal tracking-[-0.015em] text-balance">{be.title}</h3>
      {meta && <p className="mt-2 font-sans text-sm text-fg-muted">{meta}</p>}
      {e.address?.trim() && <p className="font-sans text-sm text-fg-subtle">{e.address.trim()}</p>}
      <Tags tags={e.tags} />
      <div className="mt-8 space-y-10">
        {be.fields.map((f, i) => (
          <Labeled key={f.key} label={f.label}>
            <DocView doc={f.doc} media={media} className={i === 0 ? "is-lead text-lg leading-[1.8]" : "text-lg leading-[1.8]"} />
          </Labeled>
        ))}
      </div>
      {be.photos.length > 0 && <div className="mt-10"><PhotoGrid photos={be.photos} media={media} /></div>}
      {e.aiAssisted && (
        <p className="mt-6 inline-flex items-center gap-1.5 font-sans text-xs text-fg-subtle">
          <Sparkles className="size-3.5" aria-hidden /> {L.aiAssisted}
        </p>
      )}
    </section>
  );
}

function PhotoGrid({ photos, media }: { photos: BookPhoto[]; media: Map<string, MediaItem> }) {
  const single = photos.length === 1;
  return (
    <div className={single ? "" : "grid grid-cols-1 gap-6 sm:grid-cols-2"}>
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
              className={single
                ? "h-auto max-h-[75vh] w-full rounded-xl border border-line bg-sunken object-contain"
                : "aspect-[4/3] w-full rounded-xl border border-line bg-sunken object-cover"}
            />
            {p.caption && <figcaption className="mt-2.5 text-center text-[0.95rem] text-fg-muted italic">{p.caption}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-8">
      <h4 className="mb-3 font-sans text-[0.7rem] font-semibold tracking-[0.2em] text-fg-subtle uppercase">{label}</h4>
      {children}
    </div>
  );
}

function Tags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5 font-sans">
      {tags.map((tag) => (
        <li key={tag} className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink">{tag}</li>
      ))}
    </ul>
  );
}

function Badge({ n, small = false }: { n: number; small?: boolean }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-accent font-sans font-bold text-accent-fg ${small ? "size-5 text-[0.65rem]" : "size-7 text-xs"}`}>
      {n}
    </span>
  );
}
