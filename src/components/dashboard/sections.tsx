import Link from "next/link";
import { ArrowRight, BookOpenText, Clock3, Gauge, Heart, Images, MapPin, Route } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { CURRENT_PHASE, navItem } from "@/config/navigation";
import type { DashboardStats, TripSummary } from "@/lib/queries/dashboard";
import { formatCount, formatDate, formatDistance, formatDuration } from "@/lib/format";
import { cn } from "@/lib/cn";
import { t } from "@/i18n";

const QUICK_ACTIONS = [
  { key: "plan", label: t.dashboard.actions.plan, accent: true },
  { key: "record", label: t.dashboard.actions.record, accent: false },
  { key: "map", label: t.dashboard.actions.map, accent: false },
  { key: "favorites", label: t.dashboard.actions.favorites, accent: false },
  { key: "travelogues", label: t.dashboard.actions.write, accent: false },
] as const;

export function QuickActions() {
  return (
    <section aria-labelledby="qa-title">
      <h2 id="qa-title" className="eyebrow">{t.dashboard.quickActions}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {QUICK_ACTIONS.map(({ key, label, accent }, i) => {
          const item = navItem(key);
          const Icon = item.icon;
          const available = item.phase <= CURRENT_PHASE;
          return (
            <li key={key} className={cn(i === 0 && "col-span-2 sm:col-span-1")}>
              {/* Etkin modüller bağlantıdır; henüz etkin olmayanlar tıklanamaz ve açıkça "Yakında" etiketlidir */}
              <QuickActionShell
                href={available ? item.href : null}
                className={cn(
                  "flex h-full min-h-28 flex-col justify-between rounded-2xl border p-4",
                  accent ? "border-ink-900 bg-ink-900 text-paper" : "border-sand-200 bg-paper-50",
                  available ? "transition hover:-translate-y-0.5 hover:shadow-md" : "opacity-75",
                )}
              >
                <div className="flex items-start justify-between">
                  <span className={cn("grid size-10 place-items-center rounded-xl", accent ? "bg-amber-500 text-ink-950" : "bg-sand-100 text-ink-800")}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {!available && (
                    <Badge className={accent ? "bg-paper/10 text-paper/80" : undefined}>
                      {t.common.soon} · {t.common.phase(item.phase)}
                    </Badge>
                  )}
                </div>
                <span className="mt-4 text-[0.95rem] leading-snug font-bold">{label}</span>
              </QuickActionShell>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function QuickActionShell({ href, className, children }: { href: string | null; className: string; children: ReactNode }) {
  if (href) return <Link href={href} className={className}>{children}</Link>;
  return <div aria-disabled className={className}>{children}</div>;
}

export function StatsGrid({ stats }: { stats: DashboardStats }) {
  const items: { label: string; value: string; Icon: LucideIcon }[] = [
    { label: t.dashboard.statLabels.trips, value: formatCount(stats.completed_trips), Icon: Route },
    { label: t.dashboard.statLabels.distance, value: formatDistance(stats.total_distance_m), Icon: Gauge },
    { label: t.dashboard.statLabels.duration, value: formatDuration(stats.total_duration_s), Icon: Clock3 },
    { label: t.dashboard.statLabels.places, value: formatCount(stats.visited_places), Icon: MapPin },
    { label: t.dashboard.statLabels.travelogues, value: formatCount(stats.travelogues), Icon: BookOpenText },
    { label: t.dashboard.statLabels.photos, value: formatCount(stats.photos), Icon: Images },
  ];
  return (
    <section aria-labelledby="stats-title">
      <h2 id="stats-title" className="eyebrow">{t.dashboard.stats}</h2>
      <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-sand-200 bg-sand-200 sm:grid-cols-3 xl:grid-cols-6 [&>div]:bg-paper-50">
        {items.map(({ label, value, Icon }) => (
          <div key={label} className="m-px p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
              <Icon className="size-3.5" aria-hidden /> {label}
            </dt>
            <dd className="mt-2 text-2xl font-extrabold tracking-tight tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5", className)}>
      <h2 className="text-base font-bold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-sand-100/60 p-4 text-sm text-stone-600">
      <Icon className="size-5 shrink-0 text-stone-500" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

export function TripList({ trips, empty }: { trips: TripSummary[]; empty: string }) {
  if (!trips.length) return <EmptyState icon={Route}>{empty}</EmptyState>;
  return (
    <ul className="divide-y divide-sand-200">
      {trips.map((trip) => (
        <li key={trip.id} className="flex items-center gap-3 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-amber-400">
            <Route className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Link href={trip.status === "planned" ? `/planla/${trip.id}` : `/yolculuklar/${trip.id}`} className="block truncate font-semibold hover:underline">
              {trip.title}
            </Link>
            <p className="flex items-center gap-1 truncate text-sm text-stone-600">
              {trip.origin && trip.destination ? (
                <>{trip.origin} <ArrowRight className="size-3" aria-hidden /> {trip.destination}</>
              ) : (
                formatDate(trip.completed_at ?? trip.planned_date)
              )}
            </p>
          </div>
          {trip.route_distance_m ? (
            <span className="text-sm font-semibold text-stone-700 tabular-nums">{formatDistance(trip.route_distance_m)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SavedPlaceList({ places }: { places: { id: string; name: string; source: string; address: string | null }[] }) {
  if (!places.length) return <EmptyState icon={Heart}>{t.dashboard.emptySaved}</EmptyState>;
  return (
    <ul className="space-y-2">
      {places.map((p) => (
        <li key={p.id}>
          <Link href="/favoriler" className="flex items-center gap-3 rounded-lg hover:bg-sand-100/60">
            <MapPin className="size-4 shrink-0 text-amber-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
            {p.source !== "manual" && <Badge>{t.favorites.sourceBadge[p.source] ?? p.source}</Badge>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EntryList({ entries }: { entries: { id: string; title: string; location_name: string | null; updated_at: string; travelogueTitle: string | null }[] }) {
  if (!entries.length) return <EmptyState icon={BookOpenText}>{t.dashboard.emptyEntries}</EmptyState>;
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id}>
          <p className="font-serif text-lg leading-snug">{e.title || e.location_name || "Adsız yazı"}</p>
          <p className="text-xs text-stone-600">{[e.travelogueTitle, formatDate(e.updated_at)].filter(Boolean).join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}
