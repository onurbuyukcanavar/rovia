import { decodeTrack } from "@/lib/gps/track";
import type { LatLng } from "@/lib/geo";
import { formatDate, formatDistance, formatDuration, formatSpeed } from "@/lib/format";
import type { MediaItem } from "@/lib/journal/types";
import type { Doc } from "@/lib/travelogue/doc";
import { formatDateRange } from "@/lib/travelogue/pdf/model";
import type { EntryType, SectionKind, Travelogue } from "@/lib/travelogue/types";
import {
  DEFAULT_PRIVACY_RADIUS, DEFAULT_SHARE_OPTIONS, SHARE_OPTION_KEYS, SHARE_VISIBILITIES,
  type ShareMedia, type ShareOptions, type SharePayload, type ShareState, type ShareVisibility,
} from "./types";
import { t } from "@/i18n";

const S = t.share;

// ── Ayarlar ─────────────────────────────────────────────────────────────────

export function normalizeOptions(raw: unknown): ShareOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_SHARE_OPTIONS };
  for (const k of SHARE_OPTION_KEYS) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}

export const isVisibility = (v: unknown): v is ShareVisibility => SHARE_VISIBILITIES.includes(v as ShareVisibility);

/** public.shares satırı (veya yokluğu) → pencere durumu */
export function shareStateFromRow(
  row: { visibility: string; token: string; options: unknown; privacy_radius_m: number } | null,
  defaultRadius = DEFAULT_PRIVACY_RADIUS,
): ShareState {
  if (!row || !isVisibility(row.visibility) || row.visibility === "private") {
    return { visibility: "private", token: null, options: row ? normalizeOptions(row.options) : { ...DEFAULT_SHARE_OPTIONS }, privacyRadiusM: row?.privacy_radius_m ?? defaultRadius };
  }
  return { visibility: row.visibility, token: row.token, options: normalizeOptions(row.options), privacyRadiusM: row.privacy_radius_m };
}

export function visibilityLabel(v: ShareVisibility): string {
  return S.visibility[v].label;
}

export function radiusLabel(m: number): string {
  return m > 0 ? S.radius(m) : S.radiusOff;
}

/** robots: yalnızca "public" dizine eklenebilir */
export function robotsFor(v: ShareVisibility | null | undefined) {
  return v === "public" ? { index: true, follow: true } : { index: false, follow: false };
}

// ── Paylaşılacaklar özeti ───────────────────────────────────────────────────

/** share_get yanıtından "Paylaşılacaklar" listesi (gerçek sayılar). */
export function previewItems(p: SharePayload | null): string[] {
  if (!p) return [];
  const P = S.preview;
  const out: string[] = [];
  const title = p.travelogue?.title ?? p.trip?.title;
  if (title) out.push(P.title(title));
  if (p.ownerName) out.push(P.ownerName(p.ownerName));
  if (p.options.route) {
    const trimmed = !p.options.endpoints && p.privacyRadiusM > 0;
    out.push(p.route ? (trimmed ? P.routeTrimmed(p.privacyRadiusM) : P.route) : P.noRoute);
  }
  if (p.trip && p.options.stats) out.push(P.stats);
  const stops = p.trip?.stops;
  if (stops) {
    out.push(P.stops(stops.length));
    const hidden = stops.filter((s) => s.lat === null).length;
    if (hidden) out.push(P.hiddenStops(hidden));
  }
  if (!p.options.endpoints && p.trip) out.push(P.endpointsHidden);
  const photos = countPhotos(p);
  if (p.options.photos) out.push(P.photos(photos));
  if (p.trip?.notes) out.push(P.notes(p.trip.notes.length));
  if (p.travelogue) out.push(P.entries(p.travelogue.entries.length));
  return out;
}

function countPhotos(p: SharePayload): number {
  const ids = new Set<string>();
  for (const m of p.trip?.photos ?? []) ids.add(m.id);
  if (p.travelogue) {
    if (p.travelogue.cover) ids.add(p.travelogue.cover.id);
    for (const e of p.travelogue.entries) for (const m of e.photos) ids.add(m.id);
    for (const id of Object.keys(p.travelogue.media)) ids.add(id);
  }
  return ids.size;
}

// ── Medya ───────────────────────────────────────────────────────────────────

/** İmzalanacak tüm dosya yolları (asıl + küçük görsel) */
export function mediaPaths(p: SharePayload): string[] {
  const set = new Set<string>();
  const add = (m: ShareMedia | null | undefined) => {
    if (!m) return;
    if (m.path) set.add(m.path);
    if (m.thumb) set.add(m.thumb);
  };
  p.trip?.photos?.forEach(add);
  if (p.travelogue) {
    add(p.travelogue.cover);
    p.travelogue.entries.forEach((e) => e.photos.forEach(add));
    Object.values(p.travelogue.media).forEach(add);
  }
  return [...set];
}

export function toMediaItem(m: ShareMedia, signed: Map<string, string>): MediaItem {
  return {
    id: m.id, tripId: null,
    url: signed.get(m.path) ?? null,
    thumbUrl: (m.thumb && signed.get(m.thumb)) || signed.get(m.path) || null,
    width: m.width, height: m.height, takenAt: m.takenAt, createdAt: m.takenAt ?? "",
    lat: null, lng: null, caption: m.caption,
  };
}

// ── Seyahatname → kitap görünümü ────────────────────────────────────────────

/** Paylaşılan seyahatnameyi kitap görünümünün (BookView) beklediği şekle çevirir. */
export function toTravelogue(p: SharePayload, signed: Map<string, string>): Travelogue | null {
  const tl = p.travelogue;
  if (!tl) return null;
  const media = new Map<string, MediaItem>();
  const add = (m: ShareMedia | null | undefined) => {
    if (m && !media.has(m.id)) media.set(m.id, toMediaItem(m, signed));
  };
  add(tl.cover);
  tl.entries.forEach((e) => e.photos.forEach(add));
  Object.values(tl.media).forEach(add);

  const trip = p.trip;
  const stats = trip?.stats ?? null;
  return {
    id: "shared",
    title: tl.title,
    subtitle: tl.subtitle,
    purpose: tl.purpose,
    summary: tl.summary,
    coverMediaId: tl.cover?.id ?? null,
    ordering: tl.ordering === "manual" ? "manual" : "chronological",
    status: "published",
    version: 0,
    createdAt: tl.updatedAt,
    updatedAt: tl.updatedAt,
    trip: trip ? {
      id: "shared-trip", title: trip.title,
      startedAt: stats?.startedAt ?? trip.startedAt, endedAt: stats?.endedAt ?? trip.completedAt,
      distanceM: stats?.distanceM ?? null, elapsedS: stats?.elapsedS ?? null,
      startLabel: null, endLabel: null,
      polyline: p.route,
    } : null,
    sections: tl.sections.map((s, i) => ({
      id: `s${i}`, kind: s.kind as SectionKind, title: s.title, content: (s.content as Doc | null) ?? null,
      isVisible: true, sortOrder: i, version: 0,
    })),
    entries: tl.entries.map((e) => ({
      id: e.id, entryType: e.entryType as EntryType, title: e.title,
      introduction: e.introduction as Doc | null, narrative: e.narrative as Doc | null,
      historyNotes: e.historyNotes as Doc | null, personalReview: e.personalReview as Doc | null,
      contentText: null, locationName: e.locationName, address: e.address, lat: e.lat, lng: e.lng,
      osmRef: null, savedPlaceId: null, visitedAt: e.visitedAt, tags: e.tags ?? [], sortOrder: e.sortOrder, version: 0,
      aiAssisted: e.aiAssisted, createdAt: e.createdAt, updatedAt: e.createdAt,
      photos: e.photos.map((m) => ({ mediaId: m.id, caption: m.caption })),
    })),
    media: [...media.values()],
  };
}

// ── Sayfa görünüm modeli ────────────────────────────────────────────────────

export type ShareChip = { key: string; label: string; value: string };

export type ShareView = {
  kind: SharePayload["kind"];
  visibility: ShareVisibility;
  title: string;
  subtitle: string | null;
  description: string | null;
  ownerName: string | null;
  dateRange: string | null;
  chips: ShareChip[];
  paths: LatLng[][];
  stops: { name: string; kind: string; lat: number | null; lng: number | null }[];
  photos: MediaItem[];
  notes: NonNullable<NonNullable<SharePayload["trip"]>["notes"]>;
  coverUrl: string | null;
  privacyRadiusM: number | null;
  /** "Bu rotayı planıma kopyala": konumu görünür en az bir durak */
  canCopy: boolean;
};

export function buildShareView(p: SharePayload, signed: Map<string, string>): ShareView {
  const trip = p.trip;
  const tl = p.travelogue;
  const stats = trip?.stats ?? null;
  const chips: ShareChip[] = [];
  const C = S.page;
  if (trip && p.options.stats) {
    const dist = stats?.distanceM ?? trip.plannedDistanceM;
    const dur = stats?.elapsedS ?? trip.plannedDurationS;
    if (dist && dist > 0) chips.push({ key: "distance", label: stats ? C.distance : C.planned, value: formatDistance(Number(dist)) });
    if (dur && dur > 0) chips.push({ key: "duration", label: C.duration, value: formatDuration(Number(dur)) });
    if (stats?.movingS && stats.movingS > 0) chips.push({ key: "moving", label: C.moving, value: formatDuration(Number(stats.movingS)) });
    if (stats?.avgKmh && stats.avgKmh > 0) chips.push({ key: "avg", label: C.avgSpeed, value: formatSpeed(Number(stats.avgKmh)) });
  }
  const start = stats?.startedAt ?? trip?.startedAt ?? null;
  const end = stats?.endedAt ?? trip?.completedAt ?? null;
  let dateRange = start || end ? formatDateRange(start, end) : trip?.plannedDate ? formatDate(trip.plannedDate) : null;
  if (!dateRange && tl) {
    const times = tl.entries.map((e) => e.visitedAt).filter((v): v is string => !!v).sort();
    if (times.length) dateRange = formatDateRange(times[0], times[times.length - 1]);
  }

  const photos: MediaItem[] = [];
  const seen = new Set<string>();
  const addPhoto = (m: ShareMedia) => {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    const item = toMediaItem(m, signed);
    if (item.url || item.thumbUrl) photos.push(item);
  };
  (trip?.photos ?? []).forEach(addPhoto);
  if (p.kind === "travelogue" && tl) tl.entries.forEach((e) => e.photos.forEach(addPhoto));

  const coverMedia = tl?.cover ?? trip?.photos?.[0] ?? tl?.entries.find((e) => e.photos.length)?.photos[0] ?? null;
  const coverUrl = coverMedia ? (signed.get(coverMedia.path) ?? (coverMedia.thumb ? signed.get(coverMedia.thumb) : undefined) ?? null) : null;
  const stops = trip?.stops ?? [];

  return {
    kind: p.kind,
    visibility: p.visibility,
    title: (p.kind === "travelogue" ? tl?.title : trip?.title) ?? tl?.title ?? trip?.title ?? "ROVIA",
    subtitle: p.kind === "travelogue" ? (tl?.subtitle ?? null) : null,
    description: p.kind === "travelogue" ? (tl?.summary ?? null) : (trip?.description ?? null),
    ownerName: p.ownerName,
    dateRange: p.options.stats || p.kind === "travelogue" ? dateRange : null,
    chips,
    paths: decodeTrack(p.route).filter((x) => x.length > 1),
    stops,
    photos,
    notes: trip?.notes ?? [],
    coverUrl,
    privacyRadiusM: !p.options.endpoints && p.privacyRadiusM > 0 && trip ? p.privacyRadiusM : null,
    canCopy: !!trip && stops.some((s) => s.lat !== null && s.lng !== null),
  };
}

// ── Sosyal kart: rota projeksiyonu ──────────────────────────────────────────

/**
 * Rotayı verilen kutuya (en-boy oranını koruyarak, ortalanmış) eşdörtgen projeksiyonla yerleştirir;
 * SVG path "d" değeri döndürür. Çok uzun izler örneklenerek kısaltılır.
 */
export function projectRoute(paths: LatLng[][], box: { width: number; height: number; padding?: number }, maxPoints = 600): string {
  const pts = paths.flat();
  if (pts.length < 2) return "";
  const pad = box.padding ?? 0;
  const midLat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * kx);
  const ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX, spanY = maxY - minY;
  const w = Math.max(1, box.width - pad * 2), h = Math.max(1, box.height - pad * 2);
  const scale = spanX === 0 && spanY === 0 ? 0 : Math.min(spanX ? w / spanX : Infinity, spanY ? h / spanY : Infinity);
  const offX = pad + (w - spanX * scale) / 2;
  const offY = pad + (h - spanY * scale) / 2;
  const total = paths.reduce((n, p) => n + p.length, 0);
  const step = Math.max(1, Math.ceil(total / maxPoints));
  const r = (v: number) => Math.round(v * 10) / 10;
  return paths
    .filter((p) => p.length > 1)
    .map((p) => {
      const sampled = p.filter((_, i) => i % step === 0 || i === p.length - 1);
      return sampled
        .map((q, i) => `${i === 0 ? "M" : "L"}${r(offX + (q.lng * kx - minX) * scale)} ${r(offY + (-q.lat - minY) * scale)}`)
        .join(" ");
    })
    .join(" ");
}
