import type { Doc } from "./doc";
import type { MediaItem } from "@/lib/journal/types";

export const SECTION_KINDS = [
  "cover", "introduction", "trip_info", "map", "chronicle", "places", "gallery", "evaluation", "epilogue", "custom",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];
/** Kullanıcının metin yazdığı bölümler; diğerleri yolculuk/yazı verisinden otomatik oluşur. */
export const TEXT_SECTION_KINDS: readonly SectionKind[] = ["introduction", "evaluation", "epilogue", "custom"];

export const ENTRY_TYPES = ["place", "chronicle", "free"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TAGS = [
  "tarih", "mimari", "doğa", "kültür", "gastronomi", "manzara", "müze", "antik kent", "köy", "sahil", "dağ", "göl", "dinlenme",
] as const;

/** Yazıdaki zengin metin alanları (TipTap JSON) */
export const RICH_FIELDS = ["introduction", "narrative", "history_notes", "personal_review"] as const;
export type RichField = (typeof RICH_FIELDS)[number];

export type TravelogueListItem = {
  id: string;
  title: string;
  subtitle: string | null;
  status: "draft" | "published";
  tripId: string | null;
  tripTitle: string | null;
  coverUrl: string | null;
  entryCount: number;
  photoCount: number;
  firstVisit: string | null;
  lastVisit: string | null;
  updatedAt: string;
};

export type TravelogueSection = {
  id: string;
  kind: SectionKind;
  title: string;
  content: Doc | null;
  isVisible: boolean;
  sortOrder: number;
  version: number;
};

export type EntryPhoto = { mediaId: string; caption: string | null };

export type TravelogueEntry = {
  id: string;
  entryType: EntryType;
  title: string;
  introduction: Doc | null;
  narrative: Doc | null;
  historyNotes: Doc | null;
  personalReview: Doc | null;
  contentText: string | null;
  locationName: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  osmRef: string | null;
  savedPlaceId: string | null;
  visitedAt: string | null;
  tags: string[];
  sortOrder: number;
  version: number;
  aiAssisted: boolean;
  createdAt: string;
  updatedAt: string;
  photos: EntryPhoto[];
};

export type TripSummary = {
  id: string;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  distanceM: number | null;
  elapsedS: number | null;
  startLabel: string | null;
  endLabel: string | null;
  /** Kaydedilen iz veya planlanan rota (polyline6) */
  polyline: string | null;
};

export type Travelogue = {
  id: string;
  title: string;
  subtitle: string | null;
  purpose: string | null;
  summary: string | null;
  coverMediaId: string | null;
  ordering: "chronological" | "manual";
  status: "draft" | "published";
  version: number;
  createdAt: string;
  updatedAt: string;
  trip: TripSummary | null;
  sections: TravelogueSection[];
  /** Görüntüleme sırasına göre (bkz. orderEntries) */
  entries: TravelogueEntry[];
  /** Yazılarda, belgelerde ve kapakta geçen + yolculuğa ait fotoğraflar (imzalı URL'lerle) */
  media: MediaItem[];
};

/** Kronolojik: ziyaret zamanı (yoksa oluşturulma) · Elle: sort_order */
export function orderEntries<T extends Pick<TravelogueEntry, "visitedAt" | "createdAt" | "sortOrder">>(
  entries: T[], ordering: "chronological" | "manual",
): T[] {
  const copy = [...entries];
  if (ordering === "manual") return copy.sort((a, b) => a.sortOrder - b.sortOrder);
  const key = (e: T) => Date.parse(e.visitedAt ?? e.createdAt);
  return copy.sort((a, b) => key(a) - key(b) || a.sortOrder - b.sortOrder);
}

/** Kaydetme sonucu (sürüm denetimli) */
export type SaveResult =
  | { ok: true; version: number; updatedAt: string }
  | { ok: false; conflict: true; serverVersion: number; message: string }
  | { ok: false; conflict?: false; message: string };
