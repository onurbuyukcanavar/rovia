/* eslint-disable @next/next/no-img-element -- kapak: özel kovadan kısa ömürlü imzalı bağlantı */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, NotebookPen, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { BookView } from "@/components/travelogue/book/book-view";
import { CopyRoute } from "@/components/share/public/copy-route";
import { ShareGallery } from "@/components/share/public/share-gallery";
import { ShareMap } from "@/components/share/public/share-map";
import { getCurrentUser } from "@/lib/dal";
import { mapStyleUrl } from "@/lib/env";
import { formatDate, formatTime } from "@/lib/format";
import { loadShare, TOKEN_RE } from "@/lib/share/server";
import { buildShareView, robotsFor, toTravelogue, type ShareView } from "@/lib/share/view";
import { t } from "@/i18n";

const P = t.share.page;
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const loaded = TOKEN_RE.test(token) ? await loadShare(token) : null;
  if (!loaded) return { title: P.unavailableTitle, robots: robotsFor(null) };
  const view = buildShareView(loaded.payload, new Map(Object.entries(loaded.signed)));
  const description = [view.subtitle, view.dateRange, ...view.chips.map((c) => `${c.label}: ${c.value}`)].filter(Boolean).join(" · ")
    || view.description?.slice(0, 200) || P.metaDescription;
  return {
    title: view.title,
    description,
    robots: robotsFor(view.visibility),
    alternates: { canonical: `/p/${token}` },
    openGraph: { type: "article", title: view.title, description, url: `/p/${token}`, siteName: t.brand.name, locale: "tr_TR" },
    twitter: { card: "summary_large_image", title: view.title, description },
  };
}

export default function SharePage({ params }: Props) {
  return (
    <div className="min-h-dvh bg-paper-50 text-ink-900">
      <header className="border-b border-sand-200 bg-paper-50/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={t.brand.name}><Logo /></Link>
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto h-[60dvh] max-w-5xl animate-pulse bg-sand-100" aria-label={t.common.loading} />}>
        <ShareContent params={params} />
      </Suspense>
      <footer className="border-t border-sand-200 py-10 text-center">
        <Link href="/" className="inline-flex flex-col items-center gap-2" data-testid="share-footer">
          <Logo />
          <span className="text-sm font-semibold">{P.footer}</span>
          <span className="text-sm text-stone-600 underline underline-offset-2">{P.footerCta}</span>
        </Link>
      </footer>
    </div>
  );
}

async function ShareContent({ params }: Props) {
  const { token } = await params;
  const loaded = TOKEN_RE.test(token) ? await loadShare(token) : null;
  if (!loaded) notFound();
  const signed = new Map(Object.entries(loaded.signed));
  const view = buildShareView(loaded.payload, signed);
  const travelogue = toTravelogue(loaded.payload, signed);
  const pins = view.stops.filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({ lat: s.lat!, lng: s.lng!, label: s.name, kind: s.kind }));
  const isTrip = view.kind === "trip";
  const showMap = isTrip && (view.paths.length > 0 || pins.length > 0);

  return (
    <main id="icerik" data-testid="share-page" data-kind={view.kind}>
      {isTrip ? <Hero view={view} /> : <CompactHeader view={view} />}

      {isTrip && (
        <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
          {(showMap || view.stops.length > 0) && (
            <section aria-labelledby="share-map-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <h2 id="share-map-title" className="sr-only">{P.mapTitle}</h2>
              {showMap && (
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-sand-200 bg-sand-100 lg:aspect-auto lg:min-h-[28rem]" data-testid="share-map">
                  <ShareMap styleUrl={mapStyleUrl()} paths={view.paths} pins={pins} />
                </div>
              )}
              {view.stops.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-bold tracking-wide text-stone-600 uppercase">{P.stopsTitle}</h3>
                  <ol className="space-y-2" data-testid="share-stops">
                    {view.stops.map((s, i) => (
                      <li key={`${i}-${s.name}`} className="flex items-start gap-3 rounded-xl border border-sand-200 bg-white p-3">
                        <MapPin className={s.kind === "destination" ? "mt-0.5 size-4 shrink-0 text-amber-600" : "mt-0.5 size-4 shrink-0 text-ink-700"} aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-semibold">{s.name}</span>
                          <span className="text-xs text-stone-500">{P.stopKinds[s.kind] ?? s.kind}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          {view.photos.length > 0 && (
            <section aria-labelledby="share-gallery-title">
              <h2 id="share-gallery-title" className="mb-4 font-serif text-2xl font-semibold">{P.galleryTitle}</h2>
              <ShareGallery photos={view.photos} />
            </section>
          )}

          {view.notes.length > 0 && (
            <section aria-labelledby="share-notes-title">
              <h2 id="share-notes-title" className="mb-4 font-serif text-2xl font-semibold">{P.notesTitle}</h2>
              <ol className="relative space-y-6 border-l-2 border-sand-300 pl-6" data-testid="share-notes">
                {view.notes.map((n, i) => (
                  <li key={`${i}-${n.notedAt}`} className="relative">
                    <span className="absolute top-1 -left-[1.95rem] grid size-5 place-items-center rounded-full border-2 border-paper-50 bg-amber-500" aria-hidden>
                      <NotebookPen className="size-2.5 text-ink-950" />
                    </span>
                    <p className="text-xs font-semibold text-stone-500">
                      {formatDate(n.notedAt)} · {formatTime(n.notedAt)} · {t.journal.kinds[n.kind] ?? n.kind}
                      {n.locationName ? ` · ${n.locationName}` : ""}
                    </p>
                    {n.title && <h3 className="mt-1 font-semibold">{n.title}</h3>}
                    {n.body && <p className="mt-1 whitespace-pre-line text-stone-700">{n.body}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {view.canCopy && <CopySection token={token} />}
          {view.privacyRadiusM && <PrivacyNote m={view.privacyRadiusM} />}
        </div>
      )}

      {travelogue && (
        <section aria-label={P.travelogueTitle} className={isTrip ? "border-t border-sand-200 bg-paper pt-6" : undefined}>
          {isTrip && <p className="eyebrow mx-auto max-w-3xl px-5 sm:px-10">{P.travelogueTitle}</p>}
          <BookView travelogue={travelogue} />
        </section>
      )}

      {!isTrip && (view.canCopy || view.privacyRadiusM) && (
        <div className="mx-auto max-w-3xl space-y-6 px-5 pb-10 sm:px-10">
          {view.canCopy && <CopySection token={token} />}
          {view.privacyRadiusM && <PrivacyNote m={view.privacyRadiusM} />}
        </div>
      )}
    </main>
  );
}

function Meta({ view, light = false }: { view: ShareView; light?: boolean }) {
  const cls = light ? "text-paper/85" : "text-stone-600";
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${cls}`}>
      {view.ownerName && <span className="inline-flex items-center gap-1.5" data-testid="share-owner"><UserRound className="size-4" aria-hidden /> {P.by(view.ownerName)}</span>}
      {view.dateRange && <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden /> {view.dateRange}</span>}
    </div>
  );
}

function Chips({ view, light = false }: { view: ShareView; light?: boolean }) {
  if (!view.chips.length) return null;
  return (
    <dl className="flex flex-wrap gap-2" data-testid="share-stats">
      {view.chips.map((c) => (
        <div key={c.key} className={light ? "rounded-xl bg-paper/15 px-3 py-2 backdrop-blur" : "rounded-xl border border-sand-200 bg-white px-3 py-2"}>
          <dt className={light ? "text-[0.65rem] font-bold tracking-widest text-paper/70 uppercase" : "text-[0.65rem] font-bold tracking-widest text-stone-500 uppercase"}>{c.label}</dt>
          <dd className="text-lg font-extrabold tabular-nums">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Hero({ view }: { view: ShareView }) {
  return (
    <section className="relative isolate overflow-hidden bg-ink-900 text-paper">
      {view.coverUrl && <img src={view.coverUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-60" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950 via-ink-950/60 to-ink-950/10" aria-hidden />
      <div className="mx-auto flex min-h-[22rem] max-w-5xl flex-col justify-end gap-4 px-4 pt-24 pb-10 sm:px-6">
        <p className="text-xs font-bold tracking-[0.25em] text-amber-400 uppercase">{P.tripEyebrow}</p>
        <h1 className="font-serif text-4xl leading-tight font-semibold text-balance sm:text-5xl" data-testid="share-title">{view.title}</h1>
        {view.description && <p className="max-w-2xl text-lg text-paper/85">{view.description}</p>}
        <Meta view={view} light />
        <Chips view={view} light />
      </div>
    </section>
  );
}

function CompactHeader({ view }: { view: ShareView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-5 pt-8 sm:px-10">
      <p className="eyebrow">{P.travelogueEyebrow}</p>
      <p className="sr-only" data-testid="share-title">{view.title}</p>
      <Meta view={view} />
      <Chips view={view} />
    </div>
  );
}

function CopySection({ token }: { token: string }) {
  return (
    <Suspense fallback={null}>
      <CopyGate token={token} />
    </Suspense>
  );
}

async function CopyGate({ token }: { token: string }) {
  const user = await getCurrentUser();
  return <CopyRoute token={token} signedIn={!!user} />;
}

function PrivacyNote({ m }: { m: number }) {
  return (
    <p className="flex items-center gap-2 text-sm text-stone-600" data-testid="share-privacy-note">
      <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden /> {P.privacyNote(m)}
    </p>
  );
}
