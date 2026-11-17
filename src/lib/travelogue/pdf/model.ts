import type { Doc } from "@/lib/travelogue/doc";
import { docMediaIds, isDocEmpty } from "@/lib/travelogue/doc";
import type { SectionKind, Travelogue, TravelogueEntry } from "@/lib/travelogue/types";
import type { MediaItem } from "@/lib/journal/types";
import { decodeTrack } from "@/lib/gps/track";
import type { LatLng } from "@/lib/geo";
import { formatCount, formatDistance, formatDuration } from "@/lib/format";
import { t } from "@/i18n";

/**
 * Seyahatnamenin "kitap" modeli: görünür bölümler sırasıyla, her biri çizime hazır verilerle.
 * Web (BookView) ve PDF aynı modeli kullanır. Saf modül: tarayıcı veya React gerektirmez.
 */
const L = t.travelogue.book;
const TZ = "Europe/Istanbul";

export type BookPhoto = { mediaId: string; caption: string | null };

export type BookEntry = {
  entry: TravelogueEntry;
  number: number;
  title: string;
  anchor: string;
  photos: BookPhoto[];
  /** Zengin metin alanları, yalnızca dolu olanlar */
  fields: { key: "introduction" | "narrative" | "historyNotes" | "personalReview"; label: string; doc: Doc }[];
};

export type BookFact = { key: keyof typeof L.facts; label: string; value: string };
export type BookMarker = { number: number; lat: number; lng: number; title: string; anchor: string };

export type BookSection =
  | { kind: "cover"; id: string; title: string; subtitle: string | null; coverMediaId: string | null; route: string | null; dateRange: string | null }
  | { kind: "text"; sectionKind: SectionKind; id: string; title: string; content: Doc | null; purpose: string | null; summary: string | null }
  | { kind: "trip_info"; id: string; title: string; facts: BookFact[] }
  | { kind: "map"; id: string; title: string; paths: LatLng[][]; markers: BookMarker[] }
  | { kind: "chronicle"; id: string; title: string; entries: BookEntry[] }
  | { kind: "places"; id: string; title: string; entries: BookEntry[] }
  | { kind: "gallery"; id: string; title: string; photos: BookPhoto[] };

export type BookModel = {
  title: string;
  subtitle: string | null;
  dateRange: string | null;
  route: string | null;
  entries: BookEntry[];
  sections: BookSection[];
  media: Map<string, MediaItem>;
};

// ── Saf yardımcılar ──────────────────────────────────────────────────────────

const TR_MAP: Record<string, string> = { ı: "i", İ: "i", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ş: "s", Ş: "s", ö: "o", Ö: "o", ç: "c", Ç: "c", â: "a", Â: "a", î: "i", Î: "i", û: "u", Û: "u" };

/** Dosya adı için Türkçe uyumlu kısa ad: "Kapadokya'da Üç Gün" → "kapadokyada-uc-gun" */
export function slugify(input: string, fallback = "seyahatname"): string {
  const s = input
    .replace(/[ıİğĞüÜşŞöÖçÇâÂîÎûÛ]/g, (c) => TR_MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return s || fallback;
}

function dayParts(iso: string): { y: number; m: number; d: number; monthName: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const monthName = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, month: "long" }).format(date);
  return { y: get("year"), m: get("month"), d: get("day"), monthName };
}

/** "12 Mayıs 2026", "12–15 Mayıs 2026", "28 Nisan – 3 Mayıs 2026", "30 Aralık 2025 – 2 Ocak 2026" */
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string | null {
  const a = start ? dayParts(start) : null;
  const b = end ? dayParts(end) : null;
  const full = (p: NonNullable<typeof a>) => `${p.d} ${p.monthName} ${p.y}`;
  if (!a && !b) return null;
  if (!a || !b) return full((a ?? b)!);
  const [x, y] = Date.parse(start!) <= Date.parse(end!) ? [a, b] : [b, a];
  if (x.y === y.y && x.m === y.m && x.d === y.d) return full(x);
  if (x.y === y.y && x.m === y.m) return `${x.d}–${y.d} ${x.monthName} ${x.y}`;
  if (x.y === y.y) return `${x.d} ${x.monthName} – ${y.d} ${y.monthName} ${y.y}`;
  return `${full(x)} – ${full(y)}`;
}

/** Ziyaret tarihi ve saati: "12 Mayıs 2026 · 14:30" */
export function formatVisit(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${date} · ${time}`;
}

export function entryTitle(e: Pick<TravelogueEntry, "title" | "locationName">): string {
  return e.title?.trim() || e.locationName?.trim() || L.untitledEntry;
}

/** Yolculuk tarihleri; yoksa yazıların ziyaret tarihlerinin ilk ve sonu. */
export function travelogueDateRange(tv: Pick<Travelogue, "trip" | "entries">): string | null {
  if (tv.trip?.startedAt || tv.trip?.endedAt) return formatDateRange(tv.trip.startedAt, tv.trip.endedAt);
  const times = tv.entries.map((e) => e.visitedAt).filter((v): v is string => !!v && !Number.isNaN(Date.parse(v)));
  if (!times.length) return null;
  times.sort((p, q) => Date.parse(p) - Date.parse(q));
  return formatDateRange(times[0], times[times.length - 1]);
}

export function travelogueRoute(tv: Pick<Travelogue, "trip" | "entries">): string | null {
  const from = tv.trip?.startLabel?.trim() || null;
  const to = tv.trip?.endLabel?.trim() || null;
  if (from || to) return from && to && from !== to ? `${from} → ${to}` : (from ?? to);
  const named = tv.entries.map((e) => e.locationName?.trim()).filter((v): v is string => !!v);
  if (!named.length) return null;
  const first = named[0];
  const last = named[named.length - 1];
  return first === last ? first : `${first} → ${last}`;
}

// ── Model ────────────────────────────────────────────────────────────────────

export function buildBook(tv: Travelogue): BookModel {
  const media = new Map(tv.media.map((m) => [m.id, m]));
  const usable = (id: string) => !!media.get(id)?.url;

  const entries: BookEntry[] = tv.entries.map((e, i) => ({
    entry: e,
    number: i + 1,
    title: entryTitle(e),
    anchor: `entry-${e.id}`,
    photos: e.photos.filter((p) => usable(p.mediaId)).map((p) => ({ mediaId: p.mediaId, caption: p.caption?.trim() || media.get(p.mediaId)?.caption?.trim() || null })),
    fields: (
      [
        ["introduction", L.fields.introduction, e.introduction],
        ["narrative", L.fields.narrative, e.narrative],
        ["historyNotes", L.fields.historyNotes, e.historyNotes],
        ["personalReview", L.fields.personalReview, e.personalReview],
      ] as const
    )
      .filter(([, , doc]) => !isDocEmpty(doc))
      .map(([key, label, doc]) => ({ key, label, doc: doc! })),
  }));

  // Galeri: yazılara bağlı fotoğraflar + yazı metinlerindeki görseller (tekrarsız)
  const gallery: BookPhoto[] = [];
  const seen = new Set<string>();
  const addPhoto = (mediaId: string, caption: string | null) => {
    if (seen.has(mediaId) || !usable(mediaId)) return;
    seen.add(mediaId);
    gallery.push({ mediaId, caption: caption ?? media.get(mediaId)?.caption?.trim() ?? null });
  };
  for (const be of entries) {
    for (const p of be.photos) addPhoto(p.mediaId, p.caption);
    for (const f of be.fields) for (const id of docMediaIds(f.doc)) addPhoto(id, null);
  }

  const dateRange = travelogueDateRange(tv);
  const route = travelogueRoute(tv);
  const coverMediaId = tv.coverMediaId && usable(tv.coverMediaId) ? tv.coverMediaId : (entries.find((e) => e.photos.length)?.photos[0]?.mediaId ?? gallery[0]?.mediaId ?? null);

  const sections: BookSection[] = [];
  const visible = [...tv.sections].filter((s) => s.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of visible) {
    const title = s.title?.trim() || L.sectionDefaults[s.kind];
    switch (s.kind) {
      case "cover":
        sections.push({ kind: "cover", id: s.id, title: tv.title, subtitle: tv.subtitle?.trim() || null, coverMediaId, route, dateRange });
        break;
      case "introduction":
      case "evaluation":
      case "epilogue":
      case "custom": {
        const purpose = s.kind === "introduction" ? tv.purpose?.trim() || null : null;
        const summary = s.kind === "introduction" ? tv.summary?.trim() || null : null;
        const content = isDocEmpty(s.content) ? null : s.content;
        if (content || purpose || summary) sections.push({ kind: "text", sectionKind: s.kind, id: s.id, title, content, purpose, summary });
        break;
      }
      case "trip_info": {
        const facts: BookFact[] = [];
        const add = (key: BookFact["key"], value: string | null | undefined) => {
          if (value) facts.push({ key, label: L.facts[key], value });
        };
        const trip = tv.trip;
        if (trip?.distanceM && trip.distanceM > 0) add("distance", formatDistance(trip.distanceM));
        if (trip?.elapsedS && trip.elapsedS > 0) add("duration", formatDuration(trip.elapsedS));
        add("dates", dateRange);
        add("start", trip?.startLabel?.trim());
        add("end", trip?.endLabel?.trim());
        if (entries.length) add("entries", formatCount(entries.length));
        if (gallery.length) add("photos", formatCount(gallery.length));
        if (facts.length) sections.push({ kind: "trip_info", id: s.id, title, facts });
        break;
      }
      case "map": {
        const paths = decodeTrack(tv.trip?.polyline).filter((p) => p.length > 1);
        const markers: BookMarker[] = entries
          .filter((be) => be.entry.lat !== null && be.entry.lng !== null && Number.isFinite(be.entry.lat) && Number.isFinite(be.entry.lng))
          .map((be) => ({ number: be.number, lat: be.entry.lat!, lng: be.entry.lng!, title: be.title, anchor: be.anchor }));
        if (paths.length || markers.length) sections.push({ kind: "map", id: s.id, title, paths, markers });
        break;
      }
      case "chronicle":
        if (entries.length) sections.push({ kind: "chronicle", id: s.id, title, entries });
        break;
      case "places": {
        const located = entries.filter((be) => be.entry.locationName?.trim() || be.entry.address?.trim() || (be.entry.lat !== null && be.entry.lng !== null));
        if (located.length) sections.push({ kind: "places", id: s.id, title, entries: located });
        break;
      }
      case "gallery":
        if (gallery.length) sections.push({ kind: "gallery", id: s.id, title, photos: gallery });
        break;
    }
  }

  return { title: tv.title, subtitle: tv.subtitle?.trim() || null, dateRange, route, entries, sections, media };
}

/** Haritadaki tüm noktalar (sınır hesabı için). */
export function mapPoints(s: Extract<BookSection, { kind: "map" }>): LatLng[] {
  return [...s.paths.flat(), ...s.markers.map((m) => ({ lat: m.lat, lng: m.lng }))];
}

export const IMAGE_PX = { full: 1600, thumb: 900 } as const;

/** PDF için hazırlanması gereken görseller: tam genişlik (kapak, metin içi, tek fotoğraf) veya küçük (ızgara). */
export function imageNeeds(model: BookModel): { mediaId: string; url: string; maxPx: number }[] {
  const out: { mediaId: string; url: string; maxPx: number }[] = [];
  const add = (mediaId: string | null, maxPx: number) => {
    const url = mediaId ? model.media.get(mediaId)?.url : null;
    if (mediaId && url) out.push({ mediaId, url, maxPx });
  };
  const addPhotos = (photos: BookPhoto[]) => photos.forEach((p) => add(p.mediaId, photos.length === 1 ? IMAGE_PX.full : IMAGE_PX.thumb));
  for (const sec of model.sections) {
    if (sec.kind === "cover") add(sec.coverMediaId, IMAGE_PX.full);
    else if (sec.kind === "text") docMediaIds(sec.content).forEach((id) => add(id, IMAGE_PX.full));
    else if (sec.kind === "chronicle")
      for (const be of sec.entries) {
        for (const f of be.fields) docMediaIds(f.doc).forEach((id) => add(id, IMAGE_PX.full));
        addPhotos(be.photos);
      }
    else if (sec.kind === "gallery") addPhotos(sec.photos);
  }
  return out;
}
