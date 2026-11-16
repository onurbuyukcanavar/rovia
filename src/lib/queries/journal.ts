import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ArchiveTrip, JournalNote, MediaItem, NoteKind, TripOption } from "@/lib/journal/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Özel kovadaki dosyalar için kısa ömürlü imzalı bağlantılar (1 saat). */
const SIGNED_URL_TTL = 3600;

export async function signPaths(supabase: SupabaseClient, paths: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const out = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 500) {
    const { data, error } = await supabase.storage.from("media").createSignedUrls(unique.slice(i, i + 500), SIGNED_URL_TTL);
    if (error) {
      console.error("[rovia] İmzalı bağlantı oluşturulamadı:", error.message);
      continue;
    }
    for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  }
  return out;
}

export type MediaRow = {
  id: string; trip_id: string | null; storage_path: string; thumb_path: string | null; width: number | null; height: number | null;
  taken_at: string | null; created_at: string; latitude: number | null; longitude: number | null; caption: string | null;
};
export const MEDIA_COLS = "id, trip_id, storage_path, thumb_path, width, height, taken_at, created_at, latitude, longitude, caption";

export async function toMediaItems(supabase: SupabaseClient, rows: MediaRow[]): Promise<MediaItem[]> {
  const urls = await signPaths(supabase, rows.flatMap((r) => [r.storage_path, r.thumb_path]));
  return rows.map((r) => ({
    id: r.id, tripId: r.trip_id,
    url: urls.get(r.storage_path) ?? null,
    thumbUrl: (r.thumb_path && urls.get(r.thumb_path)) ?? urls.get(r.storage_path) ?? null,
    width: r.width, height: r.height, takenAt: r.taken_at, createdAt: r.created_at,
    lat: r.latitude, lng: r.longitude, caption: r.caption,
  }));
}

type NoteRow = {
  id: string; trip_id: string | null; kind: string; title: string | null; body: string | null; noted_at: string;
  location_name: string | null; latitude: number | null; longitude: number | null; saved_place_id: string | null;
  trips: { title: string } | null; journal_note_media: { media_id: string; sort_order: number }[];
};
const NOTE_COLS =
  "id, trip_id, kind, title, body, noted_at, location_name, latitude, longitude, saved_place_id, trips(title), journal_note_media(media_id, sort_order)";

const toNote = (n: NoteRow): JournalNote => ({
  id: n.id, tripId: n.trip_id, tripTitle: n.trips?.title ?? null, kind: n.kind as NoteKind, title: n.title, body: n.body,
  notedAt: n.noted_at, locationName: n.location_name, lat: n.latitude, lng: n.longitude, savedPlaceId: n.saved_place_id,
  mediaIds: [...(n.journal_note_media ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((m) => m.media_id),
});

/** Yolculuk detayındaki günlük: notlar (zamana göre) ve yolculuğun tüm fotoğrafları. */
export async function getTripJournal(tripId: string): Promise<{ notes: JournalNote[]; media: MediaItem[] }> {
  const supabase = await createClient();
  const [notes, media] = await Promise.all([
    supabase.from("journal_notes").select(NOTE_COLS).eq("trip_id", tripId).order("noted_at", { ascending: true }).limit(500),
    supabase.from("media_assets").select(MEDIA_COLS).eq("trip_id", tripId)
      .order("taken_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(1000),
  ]);
  if (notes.error) throw new Error(`JOURNAL_QUERY_FAILED: ${notes.error.message}`);
  if (media.error) throw new Error(`MEDIA_QUERY_FAILED: ${media.error.message}`);
  const noteList = ((notes.data ?? []) as unknown as NoteRow[]).map(toNote);

  // Nota eklenmiş ama yolculuğa bağlı olmayan fotoğraflar da gösterilsin
  const have = new Set((media.data ?? []).map((m) => m.id));
  const missing = [...new Set(noteList.flatMap((n) => n.mediaIds))].filter((id) => !have.has(id));
  let extra: MediaRow[] = [];
  if (missing.length) {
    const { data } = await supabase.from("media_assets").select(MEDIA_COLS).in("id", missing);
    extra = (data ?? []) as MediaRow[];
  }
  return { notes: noteList, media: await toMediaItems(supabase, [...((media.data ?? []) as MediaRow[]), ...extra]) };
}

/** Seyahat Günlüğüm: tüm notlar (yeniden eskiye) ve tüm fotoğraflar. */
export async function getJournalOverview(): Promise<{ notes: JournalNote[]; media: MediaItem[]; trips: TripOption[] }> {
  const supabase = await createClient();
  const [notes, media, trips] = await Promise.all([
    supabase.from("journal_notes").select(NOTE_COLS).order("noted_at", { ascending: false }).limit(500),
    supabase.from("media_assets").select(MEDIA_COLS)
      .order("taken_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000),
    supabase.from("trips").select("id, title, planned_date, started_at, status").neq("status", "planned")
      .order("started_at", { ascending: false, nullsFirst: false }).limit(300),
  ]);
  if (notes.error) throw new Error(`JOURNAL_QUERY_FAILED: ${notes.error.message}`);
  if (media.error) throw new Error(`MEDIA_QUERY_FAILED: ${media.error.message}`);
  if (trips.error) throw new Error(`TRIPS_QUERY_FAILED: ${trips.error.message}`);
  return {
    notes: ((notes.data ?? []) as unknown as NoteRow[]).map(toNote),
    media: await toMediaItems(supabase, (media.data ?? []) as MediaRow[]),
    trips: (trips.data ?? []).map((tr) => ({ id: tr.id, title: tr.title, date: tr.started_at ?? tr.planned_date })),
  };
}

/** Yolculuk arşivi: tamamlanan yolculuklar, özetleri, rota önizlemesi ve kapak fotoğrafı. */
export async function listArchive(): Promise<ArchiveTrip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trip_archive");
  if (error) throw new Error(`ARCHIVE_QUERY_FAILED: ${error.message}`);
  const rows = data ?? [];
  const urls = await signPaths(supabase, rows.map((r) => r.cover_thumb));
  return rows.map((r) => ({
    id: r.id!, title: r.title ?? "", description: r.description, startedAt: r.started_at, endedAt: r.ended_at,
    distanceM: Number(r.distance_m ?? 0), elapsedS: r.elapsed_s ?? 0, movingS: r.moving_s ?? 0,
    startLabel: r.start_label, endLabel: r.end_label, polyline: r.polyline,
    photoCount: r.photo_count ?? 0, noteCount: r.note_count ?? 0,
    coverUrl: r.cover_thumb ? (urls.get(r.cover_thumb) ?? null) : null,
  }));
}

export async function getMediaQuota(): Promise<{ bytes: number; count: number; maxBytes: number; maxCount: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("media_quota");
  const q = (data ?? {}) as { bytes?: number; count?: number; max_bytes?: number; max_count?: number };
  return { bytes: Number(q.bytes ?? 0), count: Number(q.count ?? 0), maxBytes: Number(q.max_bytes ?? 314572800), maxCount: Number(q.max_count ?? 3000) };
}
