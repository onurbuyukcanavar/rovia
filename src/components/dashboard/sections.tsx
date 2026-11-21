import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpenText, Clock3, Gauge, Heart, Images, MapPin, Route } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CURRENT_PHASE, navItem } from "@/config/navigation";
import type { DashboardStats, TripSummary } from "@/lib/queries/dashboard";
import { formatCount, formatDate, formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

/* Panel gece temasında ortak kart yüzeyi (ana sayfadaki çerçeveli, camsı kartlarla aynı dil) */
const SURFACE = "rounded-[var(--radius-card)] border border-paper/[0.09] bg-paper/[0.035] backdrop-blur-[2px]";

/** Ana sayfadaki numaralı başlık: "01 —— KEŞFET". Numara süs; başlığın erişilebilir adı yalnızca metindir. */
export function SectionTitle({ index, id, children, aside }: { index: number; id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="flex min-w-0 items-center gap-3 text-xs font-semibold tracking-[0.24em] text-amber-400 uppercase">
        <span aria-hidden className="text-paper/50 tabular-nums">{String(index).padStart(2, "0")}</span>
        <span aria-hidden className="h-px w-8 shrink-0 bg-amber-400/60" />
        <span className="min-w-0 break-words">{children}</span>
      </h2>
      {aside}
    </div>
  );
}

const QUICK_ACTIONS = [
  { key: "explore", label: t.dashboard.actions.explore, hint: t.dashboard.actionHints.explore },
  { key: "record", label: t.dashboard.actions.record, hint: t.dashboard.actionHints.record },
  { key: "map", label: t.dashboard.actions.map, hint: t.dashboard.actionHints.map },
  { key: "favorites", label: t.dashboard.actions.favorites, hint: t.dashboard.actionHints.favorites },
  { key: "travelogues", label: t.dashboard.actions.write, hint: t.dashboard.actionHints.write },
] as const;

/** Hızlı işlemler. "Yeni Yolculuk Planla" ana çağrı olarak karşılama alanındadır; ROVIA Explore öne çıkan geniş karttır. */
export function QuickActions({ index = 1 }: { index?: number }) {
  return (
    <section aria-labelledby="qa-title">
      <SectionTitle index={index} id="qa-title">{t.dashboard.quickActions}</SectionTitle>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {QUICK_ACTIONS.map(({ key, label, hint }, i) => {
          const item = navItem(key);
          const Icon = item.icon;
          const available = item.phase <= CURRENT_PHASE;
          const featured = i === 0;
          return (
            <li key={key} className={cn("min-w-0", featured && "col-span-2")}>
              {/* Etkin modüller bağlantıdır; henüz etkin olmayanlar tıklanamaz ve açıkça "Yakında" etiketlidir */}
              <QuickActionShell
                href={available ? item.href : null}
                className={cn(
                  "group relative isolate flex h-full min-h-32 flex-col justify-between overflow-hidden rounded-[var(--radius-card)] border p-4 sm:p-5",
                  featured
                    ? "border-amber-400/35 bg-[radial-gradient(120%_140%_at_100%_100%,rgb(232_145_45/0.28),transparent_60%),linear-gradient(to_bottom_right,rgb(22_34_58/0.9),rgb(10_17_29/0.9))]"
                    : "border-paper/[0.09] bg-paper/[0.035]",
                  available
                    ? "transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-amber-400/50 hover:bg-paper/[0.06] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    : "opacity-75",
                )}
              >
                {featured && <RoadLines />}
                <div className="flex items-start justify-between gap-2">
                  <span className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    featured ? "bg-amber-500 text-ink-950" : "border border-paper/10 bg-paper/[0.04] text-amber-300",
                  )}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {available ? (
                    <ArrowUpRight className="size-4 text-paper/50 transition-colors group-hover:text-amber-300" aria-hidden />
                  ) : (
                    <Badge className="bg-paper/10! text-paper/80!">{t.common.soon} · {t.common.phase(item.phase)}</Badge>
                  )}
                </div>
                <div className="mt-5 min-w-0">
                  <span className={cn("block leading-snug break-words text-paper", featured ? "text-xl font-light tracking-tight sm:text-2xl" : "text-[0.95rem] font-bold")}>
                    {label}
                  </span>
                  <span className={cn("mt-1 block text-sm leading-snug break-words text-paper/65", !featured && "text-[0.8rem]")}>{hint}</span>
                </div>
              </QuickActionShell>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Öne çıkan kartta ufka uzanan iki yol çizgisi (durağan, süs). */
function RoadLines() {
  return (
    <svg aria-hidden viewBox="0 0 200 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-2/3 opacity-60">
      <path d="M200 100 C 160 70 150 40 120 0" stroke="rgb(247 245 240 / 0.18)" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      <path d="M140 100 C 120 70 115 40 100 0" stroke="rgb(240 169 74 / 0.55)" strokeWidth="1.5" strokeDasharray="6 7" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function QuickActionShell({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <div aria-disabled className={className}>{children}</div>;
}

/** "1.234,5 km", "3 sa 20 dk": rakamlar gösterge yazısıyla büyük, birimler küçük. */
function OdometerValue({ value, accent }: { value: string; accent?: boolean }) {
  const parts = value.split(/(\d[\d.,]*)/).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span key={i} className={accent ? "text-amber-300" : "text-paper"}>{p}</span>
        ) : (
          <span key={i} className="text-[0.5em] font-normal tracking-normal text-paper/60">{p}</span>
        ),
      )}
    </>
  );
}

export function StatsGrid({ stats, index = 2 }: { stats: DashboardStats; index?: number }) {
  const items: { label: string; value: string; Icon: LucideIcon }[] = [
    { label: t.dashboard.statLabels.distance, value: formatDistance(stats.total_distance_m), Icon: Gauge },
    { label: t.dashboard.statLabels.trips, value: formatCount(stats.completed_trips), Icon: Route },
    { label: t.dashboard.statLabels.duration, value: formatDuration(stats.total_duration_s), Icon: Clock3 },
    { label: t.dashboard.statLabels.places, value: formatCount(stats.visited_places), Icon: MapPin },
    { label: t.dashboard.statLabels.travelogues, value: formatCount(stats.travelogues), Icon: BookOpenText },
    { label: t.dashboard.statLabels.photos, value: formatCount(stats.photos), Icon: Images },
  ];
  return (
    <section aria-labelledby="stats-title">
      <SectionTitle index={index} id="stats-title" aside={<p className="text-sm text-paper/60">{t.dashboard.statsCaption}</p>}>
        {t.dashboard.stats}
      </SectionTitle>
      <dl className={cn("mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-paper/[0.09] bg-paper/[0.08] sm:grid-cols-3 xl:grid-cols-6")}>
        {items.map(({ label, value, Icon }, i) => (
          <div key={label} className={cn("flex min-w-0 flex-col bg-ink-950 p-4 sm:p-5")}>
            <div aria-hidden className="panel-gauge-ticks h-1.5 w-full" />
            <dt className="mt-3 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-paper/65">
              <Icon className={cn("size-3.5 shrink-0", i === 0 ? "text-amber-400" : "text-paper/50")} aria-hidden />
              <span className="min-w-0 break-words">{label}</span>
            </dt>
            <dd className="mt-1.5 text-[1.75rem] leading-none font-extralight tracking-[-0.03em] break-words tabular-nums sm:text-[2.2rem]">
              <OdometerValue value={value} accent={i === 0} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Panel({ title, children, className, index, id }: { title: string; children: ReactNode; className?: string; index?: number; id?: string }) {
  const headingId = id ?? `panel-${index ?? title}`.replace(/\s+/g, "-");
  return (
    <section aria-labelledby={headingId} className={cn("min-w-0", className)}>
      {index ? (
        <SectionTitle index={index} id={headingId}>{title}</SectionTitle>
      ) : (
        <h2 id={headingId} className="text-base font-bold text-paper">{title}</h2>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function EmptyState({ icon: Icon, children, tone = "light" }: { icon: LucideIcon; children: ReactNode; tone?: "light" | "night" }) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl p-4 text-sm",
      tone === "night" ? "border border-dashed border-paper/15 text-paper/70" : "bg-sand-100/60 text-stone-600",
    )}>
      <Icon className={cn("size-5 shrink-0", tone === "night" ? "text-amber-400/80" : "text-stone-500")} aria-hidden />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

/** Rota kartları: başlangıç noktası, kesik yol çizgisi ve amber varış noktası; mesafe gösterge yazısıyla. */
export function TripList({ trips, empty }: { trips: TripSummary[]; empty: string }) {
  if (!trips.length) return <EmptyState icon={Route} tone="night">{empty}</EmptyState>;
  return (
    <ul className="grid grid-cols-1 gap-3">
      {trips.map((trip) => {
        const href = trip.status === "planned" ? `/planla/${trip.id}` : `/yolculuklar/${trip.id}`;
        const date = formatDate(trip.completed_at ?? trip.planned_date);
        return (
          <li key={trip.id} className={cn(SURFACE, "group relative min-w-0 p-4 transition-colors hover:border-amber-400/40 hover:bg-paper/[0.06] sm:p-5")}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                {/* Bağlantı kartın tamamını kaplar; erişilebilir adı yalnızca yolculuk adıdır */}
                <Link href={href} className="block truncate font-semibold text-paper after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-amber-500">
                  {trip.title}
                </Link>
                {date && <p className="mt-0.5 truncate text-xs text-paper/60">{date}</p>}
              </div>
              {trip.route_distance_m ? (
                <span className="shrink-0 text-xl leading-none font-extralight tracking-tight tabular-nums">
                  <OdometerValue value={formatDistance(trip.route_distance_m)} accent />
                </span>
              ) : (
                <ArrowRight className="mt-1 size-4 shrink-0 text-paper/50 group-hover:text-amber-300" aria-hidden />
              )}
            </div>
            {trip.origin && trip.destination && (
              <div className="mt-4">
                <div aria-hidden className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full border-2 border-paper/80" />
                  <span className="h-0 flex-1 border-t-2 border-dashed border-paper/25 transition-colors group-hover:border-amber-400/60" />
                  <span className="size-3 shrink-0 rounded-full bg-amber-500 shadow-[0_0_12px_rgb(232_145_45/0.7)]" />
                </div>
                <p className="mt-2 flex min-w-0 justify-between gap-3 text-sm text-paper/75">
                  <span className="min-w-0 truncate"><span className="sr-only">{t.dashboard.routeFrom}: </span>{trip.origin}</span>
                  <span className="min-w-0 truncate text-right"><span className="sr-only">{t.dashboard.routeTo}: </span>{trip.destination}</span>
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SavedPlaceList({ places }: { places: { id: string; name: string; source: string; address: string | null }[] }) {
  if (!places.length) return <EmptyState icon={Heart} tone="night">{t.dashboard.emptySaved}</EmptyState>;
  return (
    <ul className={cn(SURFACE, "divide-y divide-paper/[0.07] overflow-hidden")}>
      {places.map((p) => (
        <li key={p.id}>
          <Link href="/favoriler" className="flex min-h-12 min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-paper/[0.05]">
            <MapPin className="size-4 shrink-0 text-amber-400" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-paper">{p.name}</span>
              {p.address && <span className="block truncate text-xs text-paper/60">{p.address}</span>}
            </span>
            {p.source !== "manual" && <Badge className="shrink-0 bg-paper/10! text-paper/80!">{t.favorites.sourceBadge[p.source] ?? p.source}</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EntryList({ entries }: { entries: { id: string; title: string; location_name: string | null; updated_at: string; travelogue_id: string; travelogueTitle: string | null }[] }) {
  if (!entries.length) return <EmptyState icon={BookOpenText} tone="night">{t.dashboard.emptyEntries}</EmptyState>;
  return (
    <ul className={cn(SURFACE, "divide-y divide-paper/[0.07] overflow-hidden")}>
      {entries.map((e) => (
        <li key={e.id} className="min-w-0 px-4 py-3">
          <Link href={`/seyahatnameler/${e.travelogue_id}/yazi/${e.id}`} className="block font-serif text-lg leading-snug break-words text-paper italic hover:text-amber-300">
            {e.title || e.location_name || t.travelogue.pages.entries.untitled}
          </Link>
          <p className="mt-0.5 truncate text-xs text-paper/60">{[e.travelogueTitle, formatDate(e.updated_at)].filter(Boolean).join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}
