export const NOTE_KINDS = ["note", "memory", "visit"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type MediaItem = {
  id: string;
  tripId: string | null;
  thumbUrl: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  createdAt: string;
  lat: number | null;
  lng: number | null;
  caption: string | null;
};

export type JournalNote = {
  id: string;
  tripId: string | null;
  tripTitle: string | null;
  kind: NoteKind;
  title: string | null;
  body: string | null;
  notedAt: string;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  savedPlaceId: string | null;
  mediaIds: string[];
};

export type ArchiveTrip = {
  id: string;
  title: string;
  description: string | null;
  startedAt: string | null;
  endedAt: string | null;
  distanceM: number;
  elapsedS: number;
  movingS: number;
  startLabel: string | null;
  endLabel: string | null;
  polyline: string | null;
  photoCount: number;
  noteCount: number;
  coverUrl: string | null;
};

export type TripOption = { id: string; title: string; date: string | null };
