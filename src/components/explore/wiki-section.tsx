"use client";
/* eslint-disable @next/next/no-img-element -- Vikipedi küçük resmi doğrudan upload.wikimedia.org'dan (CSP img-src); Next görsel optimizasyonu kullanılmıyor */
import { BookOpen, ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import { mapsApi } from "@/lib/maps/client";
import { useKeyedRequest } from "@/lib/maps/use-keyed-request";
import type { WikiInfo } from "@/lib/wiki/parse";
import { wikiRequestFor, wikiRequestKey, type WikiRequest } from "@/lib/wiki/tags";
import { t } from "@/i18n";

const W = t.explore.wiki;

/** Oturum boyunca istemci önbelleği: panel yeniden açılınca istek atılmaz (null = madde yok). */
const memo = new Map<string, WikiInfo | null>();
const MEMO_MAX = 200;

function remember(key: string, info: WikiInfo | null) {
  if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
  memo.set(key, info);
}

type Place = Parameters<typeof wikiRequestFor>[0];

/**
 * "Hakkında": Vikipedi özeti, küçük resim, Wikidata bilgileri ve CC BY-SA atfı. Panel açılınca bir kez istenir;
 * yüklenirken iskelet, hata ya da madde yoksa hiçbir şey çizilmez.
 */
export function WikiSection({ place }: { place: Place }) {
  const request = wikiRequestFor(place);
  const key = request ? wikiRequestKey(request) : null;
  const cached = key !== null && memo.has(key);
  const req = useKeyedRequest<WikiInfo | null>(cached ? null : key, async (signal) => {
    const info = await mapsApi.wiki(request as WikiRequest, signal);
    remember(key!, info);
    return info;
  });
  const info = cached ? memo.get(key!) ?? null : req.data ?? null;

  if (!key) return null;
  if (!cached && req.loading) return <WikiSkeleton />;
  if (!info) return null;
  return <WikiCard info={info} />;
}

function WikiSkeleton() {
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-raised p-3" aria-busy="true" aria-label={W.loading} data-testid="wiki-loading">
      <div className="aspect-[16/9] w-full animate-pulse rounded-xl bg-sunken" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-sunken" />
      <div className="h-3 w-full animate-pulse rounded bg-sunken" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-sunken" />
    </div>
  );
}

function WikiCard({ info }: { info: WikiInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const headingId = useId();
  const textId = useId();
  const long = info.extract.length > 280;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-line bg-raised text-sm" aria-labelledby={headingId} data-testid="wiki-info">
      {info.thumbnail && !imgFailed && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-sunken">
          <img src={info.thumbnail.src} alt={W.imageAlt(info.title)} loading="lazy" decoding="async" referrerPolicy="no-referrer"
            width={info.thumbnail.width} height={info.thumbnail.height} onError={() => setImgFailed(true)}
            className="size-full object-cover" />
        </div>
      )}
      <div className="space-y-2.5 p-3">
        <header className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-fg-muted uppercase">
            <BookOpen className="size-3.5" aria-hidden /> {W.title}
          </h3>
          <p className="mt-1 font-bold break-words text-fg" lang={info.lang}>{info.title}</p>
          {info.description && <p className="text-xs break-words text-fg-muted" lang={info.lang}>{info.description}</p>}
        </header>

        <div className="min-w-0">
          <p id={textId} lang={info.lang} className={`break-words whitespace-pre-line text-fg-muted ${expanded ? "" : "line-clamp-5"}`}>
            {info.extract}
          </p>
          {long && (
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} aria-controls={textId}
              className="mt-1 text-xs font-semibold text-accent-ink hover:underline">
              {expanded ? W.readLess : W.readMore}
            </button>
          )}
        </div>

        {info.facts.length > 0 && (
          <dl className="grid grid-cols-1 gap-1.5 border-t border-line pt-2.5 text-xs" data-testid="wiki-facts">
            {info.facts.map((f) => (
              <div key={f.key} className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-2">
                <dt className="font-semibold text-fg-muted">{f.label}</dt>
                <dd className="min-w-0 break-words text-fg">
                  {f.href ? (
                    <a href={f.href} target="_blank" rel="noopener noreferrer nofollow" className="break-all underline-offset-2 hover:underline">{f.value}</a>
                  ) : f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-line pt-2 text-[0.7rem] text-fg-subtle" data-testid="wiki-attribution">
          <a href={info.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-accent-ink hover:underline">
            {W.source} <ExternalLink className="size-3" aria-hidden />
          </a>
          <span aria-hidden>·</span>
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.tr" target="_blank" rel="noopener noreferrer license" className="hover:underline">{W.license}</a>
          {info.thumbnail && info.imageDescriptionUrl && !imgFailed && (
            <>
              <span aria-hidden>·</span>
              <a href={info.imageDescriptionUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{W.image}</a>
            </>
          )}
        </p>
        {info.source === "geosearch" && <p className="text-[0.65rem] text-fg-subtle">{W.geoNote}</p>}
      </div>
    </section>
  );
}

/** "Tripadvisor'da gör": yalnızca dış arama bağlantısı (puan yok, API yok). */
export function TripadvisorLink({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-testid="tripadvisor-link"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink hover:underline">
      {t.explore.tripadvisor} <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}
