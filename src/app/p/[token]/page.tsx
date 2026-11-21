/* eslint-disable @next/next/no-img-element -- kapak: özel kovadan kısa ömürlü imzalı bağlantı */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, NotebookPen, ShieldCheck, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SectionEyebrow, SectionTitle } from "@/components/ui/section-eyebrow";
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
    // Tema: ziyaretçinin tercihi (çerez yoksa varsayılan koyu) — kök düzendeki tema betiği belirler
    <div className="page-backdrop min-h-dvh text-fg">
      <header className="border-b border-line bg-chrome pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label={t.brand.name}><Logo /></Link>
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto h-[60dvh] max-w-5xl animate-pulse rounded-b-[var(--radius-card)] bg-sunken" aria-label={t.common.loading} />}>
        <ShareContent params={params} />
      </Suspense>
      <footer className="border-t border-line py-12 pb-[calc(3rem+env(safe-area-inset-bottom))] text-center">
        <Link href="/" className="group inline-flex flex-col items-center gap-2 rounded-xl px-4 py-2" data-testid="share-footer">
          <Logo />
          <span className="mt-1 text-sm font-semibold text-fg">{P.footer}</span>
          <span className="text-sm text-accent-ink underline decoration-accent/50 underline-offset-4 group-hover:decoration-current">{P.footerCta}</span>
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
    <main id="icerik" data-themed data-testid="share-page" data-kind={view.kind}>
      {isTrip ? <Hero view={view} /> : <CompactHeader view={view} />}

      {isTrip && (
        <div className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6">
          {(showMap || view.stops.length > 0) && (
            <section aria-labelledby="share-map-title" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <h2 id="share-map-title" className="sr-only">{P.mapTitle}</h2>
              {showMap && (
                <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] border border-line bg-sunken shadow-[var(--shadow-card)] lg:aspect-auto lg:min-h-[28rem]" data-testid="share-map">
                  <ShareMap styleUrl={mapStyleUrl()} paths={view.paths} pins={pins} />
                </div>
              )}
              {view.stops.length > 0 && (
                <div>
                  <SectionEyebrow as="h3" className="mb-4">{P.stopsTitle}</SectionEyebrow>
                  <ol className="space-y-2" data-testid="share-stops">
                    {view.stops.map((s, i) => (
                      <li key={`${i}-${s.name}`} className="flex items-start gap-3 rounded-xl border border-line bg-raised p-3 shadow-[var(--shadow-card)]">
                        <MapPin className={s.kind === "destination" ? "mt-0.5 size-4 shrink-0 text-accent-ink" : "mt-0.5 size-4 shrink-0 text-fg-muted"} aria-hidden />
                        <span className="min-w-0">
                          <span className="block font-semibold break-words text-fg">{s.name}</span>
                          <span className="text-xs text-fg-subtle">{P.stopKinds[s.kind] ?? s.kind}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}

          {view.photos.length > 0 && (
            <section aria-labelledby="share-gallery-title" className="space-y-5">
              <SectionTitle id="share-gallery-title" index={2}>{P.galleryTitle}</SectionTitle>
              <ShareGallery photos={view.photos} />
            </section>
          )}

          {view.notes.length > 0 && (
            <section aria-labelledby="share-notes-title" className="space-y-6">
              <SectionTitle id="share-notes-title" index={3}>{P.notesTitle}</SectionTitle>
              <ol className="relative space-y-7 border-l border-line-strong pl-6" data-testid="share-notes">
                {view.notes.map((n, i) => (
                  <li key={`${i}-${n.notedAt}`} className="relative">
                    <span className="absolute top-1 -left-[1.85rem] grid size-5 place-items-center rounded-full border-2 border-surface bg-accent" aria-hidden>
                      <NotebookPen className="size-2.5 text-accent-fg" />
                    </span>
                    <p className="text-xs font-semibold text-fg-subtle">
                      {formatDate(n.notedAt)} · {formatTime(n.notedAt)} · {t.journal.kinds[n.kind] ?? n.kind}
                      {n.locationName ? ` · ${n.locationName}` : ""}
                    </p>
                    {n.title && <h3 className="mt-1 text-lg font-semibold tracking-tight text-fg">{n.title}</h3>}
                    {n.body && <p className="mt-1.5 max-w-prose font-serif text-[1.08rem] leading-relaxed whitespace-pre-line text-fg/90">{n.body}</p>}
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
        <section aria-label={P.travelogueTitle} className={isTrip ? "border-t border-line pt-10" : undefined}>
          {isTrip && <SectionEyebrow index={4} className="mx-auto max-w-3xl px-5 sm:px-0">{P.travelogueTitle}</SectionEyebrow>}
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
  const cls = light ? "text-fg" : "text-fg-muted";
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
        <div key={c.key} className={light ? "glass rounded-xl px-3.5 py-2" : "rounded-xl border border-line bg-raised px-3.5 py-2 shadow-[var(--shadow-card)]"}>
          <dt className={light ? "text-[0.65rem] font-bold tracking-widest text-fg-muted uppercase" : "text-[0.65rem] font-bold tracking-widest text-fg-subtle uppercase"}>{c.label}</dt>
          <dd className="text-xl font-light tracking-[-0.02em] text-fg tabular-nums">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Hero({ view }: { view: ShareView }) {
  return (
    // Kapak her temada gecedir (fotoğraf/gök üzerinde açık yazı): koyu tema adası
    <section data-theme="dark" className="relative isolate overflow-hidden bg-sunken text-fg">
      {view.coverUrl ? (
        <img src={view.coverUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-70" />
      ) : (
        <div aria-hidden className="panel-hero-sky absolute inset-0 -z-10">
          <svg viewBox="0 0 800 400" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full opacity-70">
            <path d="M-300 400 L 596 230 M 1300 400 L 604 230" className="stroke-fg/25" strokeWidth="1.2" fill="none" />
            <path d="M600 400 L 600 230" className="stroke-accent/60" strokeWidth="2" strokeDasharray="16 20" fill="none" />
          </svg>
        </div>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-sunken via-sunken/60 to-sunken/10" aria-hidden />
      <div className="mx-auto flex min-h-[24rem] max-w-5xl flex-col justify-end gap-4 px-4 pt-24 pb-10 sm:min-h-[28rem] sm:px-6 sm:pb-12">
        <SectionEyebrow index={1}>{P.tripEyebrow}</SectionEyebrow>
        <h1 className="text-[clamp(2.4rem,9vw,4.25rem)] leading-[1.02] font-extralight tracking-[-0.035em] text-balance break-words" data-testid="share-title">{view.title}</h1>
        {view.description && <p className="max-w-2xl font-serif text-lg leading-relaxed text-fg-muted italic sm:text-xl">{view.description}</p>}
        <Meta view={view} light />
        <Chips view={view} light />
      </div>
    </section>
  );
}

function CompactHeader({ view }: { view: ShareView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-5 pt-8 sm:px-0">
      <SectionEyebrow>{P.travelogueEyebrow}</SectionEyebrow>
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
    <p className="flex items-center gap-2 text-sm text-fg-muted" data-testid="share-privacy-note">
      <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden /> {P.privacyNote(m)}
    </p>
  );
}
