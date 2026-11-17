/** Paylaşım (PHASE 9): share_set / share_get sözleşmesi. Bkz. supabase/migrations/20261117000300_sharing.sql */

export const SHARE_VISIBILITIES = ["private", "link", "public"] as const;
export type ShareVisibility = (typeof SHARE_VISIBILITIES)[number];
export type ShareKind = "trip" | "travelogue";

export const SHARE_OPTION_KEYS = ["route", "stats", "stops", "photos", "notes", "travelogue", "ownerName", "endpoints"] as const;
export type ShareOptionKey = (typeof SHARE_OPTION_KEYS)[number];
export type ShareOptions = Record<ShareOptionKey, boolean>;

/** Veritabanındaki normalize_share_options() varsayılanlarıyla aynı */
export const DEFAULT_SHARE_OPTIONS: ShareOptions = {
  route: true, stats: true, stops: true, photos: true, notes: false, travelogue: true, ownerName: false, endpoints: false,
};

/** Gizlilik çevresi seçenekleri (metre; 0 = kapalı) */
export const PRIVACY_RADII = [0, 250, 500, 1000, 2000] as const;
export const DEFAULT_PRIVACY_RADIUS = 500;

export type ShareState = {
  visibility: ShareVisibility;
  token: string | null;
  options: ShareOptions;
  privacyRadiusM: number;
};

export type ShareMedia = {
  id: string; path: string; thumb: string | null; width: number | null; height: number | null;
  caption: string | null; takenAt: string | null;
};

export type ShareStop = { name: string; kind: string; lat: number | null; lng: number | null };
export type ShareNote = {
  title: string | null; body: string | null; notedAt: string; kind: string;
  locationName: string | null; lat: number | null; lng: number | null;
};

export type ShareTrip = {
  title: string;
  description: string | null;
  status: string;
  plannedDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  stats: { distanceM: number | null; elapsedS: number | null; movingS: number | null; avgKmh: number | null; startedAt: string | null; endedAt: string | null } | null;
  plannedDistanceM: number | null;
  plannedDurationS: number | null;
  stops: ShareStop[] | null;
  notes: ShareNote[] | null;
  photos: ShareMedia[] | null;
};

export type ShareEntry = {
  id: string; entryType: string; title: string;
  introduction: unknown; narrative: unknown; historyNotes: unknown; personalReview: unknown;
  locationName: string | null; address: string | null; lat: number | null; lng: number | null;
  visitedAt: string | null; tags: string[] | null; aiAssisted: boolean; sortOrder: number; createdAt: string;
  photos: ShareMedia[];
};

export type ShareTravelogue = {
  title: string; subtitle: string | null; purpose: string | null; summary: string | null;
  ordering: "chronological" | "manual"; updatedAt: string;
  cover: ShareMedia | null;
  sections: { kind: string; title: string; content: unknown }[];
  entries: ShareEntry[];
  media: Record<string, ShareMedia>;
};

/** share_get() yanıtı */
export type SharePayload = {
  kind: ShareKind;
  visibility: ShareVisibility;
  options: ShareOptions;
  privacyRadiusM: number;
  ownerName: string | null;
  route: string | null;
  trip?: ShareTrip;
  travelogue?: ShareTravelogue;
};
