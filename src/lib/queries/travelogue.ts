import "server-only";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_COLS, signPaths, toMediaItems, type MediaRow } from "@/lib/queries/journal";
import { docMediaIds, type Doc } from "@/lib/travelogue/doc";
import {
  orderEntries, type EntryType, type SectionKind, type Travelogue, type TravelogueEntry, type TravelogueListItem, type TripSummary,
} from "@/lib/travelogue/types";

export async function listTravelogues(): Promise<TravelogueListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("travelogue_list");
  if (error) throw new Error(`TRAVELOGUE_LIST_FAILED: ${error.message}`);
  const rows = data ?? [];
  const urls = await signPaths(supabase, rows.map((r) => r.cover_thumb));
  return rows.map((r) => ({
    id: r.id!, title: r.title ?? "", subtitle: r.subtitle, status: (r.status ?? "draft") as "draft" | "published",
    tripId: r.trip_id, tripTitle: r.trip_title, coverUrl: r.cover_thumb ? (urls.get(r.cover_thumb) ?? null) : null,
    entryCount: r.entry_count ?? 0, photoCount: r.photo_count ?? 0,
    firstVisit: r.first_visit, lastVisit: r.last_visit, updatedAt: r.updated_at!,
  }));
}

/** "Seyahatnameye ekle" seçicisi için kısa liste */
export async function listTravelogueTargets(): Promise<{ id: string; title: string; tripTitle: string | null }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("travelogues").select("id, title, trips(title)").order("updated_at", { ascending: false }).limit(200);
  if (error) throw new Error(`TRAVELOGUE_TARGETS_FAILED: ${error.message}`);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, tripTitle: (r.trips as unknown as { title: string } | null)?.title ?? null }));
}

type EntryRow = {
  id: string; entry_type: string; title: string; introduction: Doc | null; narrative: Doc | null; history_notes: Doc | null;
  personal_review: Doc | null; content_text: string | null; location_name: string | null; address: string | null;
  latitude: number | null; longitude: number | null; osm_ref: string | null; saved_place_id: string | null;
  visited_at: string | null; tags: string[]; sort_order: number; version: number; ai_assisted: boolean;
  created_at: string; updated_at: string; travelogue_entry_media: { media_id: string; caption: string | null; sort_order: number }[];
};
const ENTRY_COLS =
  "id, entry_type, title, introduction, narrative, history_notes, personal_review, content_text, location_name, address, latitude, longitude, osm_ref, saved_place_id, visited_at, tags, sort_order, version, ai_assisted, created_at, updated_at, travelogue_entry_media(media_id, caption, sort_order)";

const toEntry = (e: EntryRow): TravelogueEntry => ({
  id: e.id, entryType: e.entry_type as EntryType, title: e.title, introduction: e.introduction, narrative: e.narrative,
  historyNotes: e.history_notes, personalReview: e.personal_review, contentText: e.content_text,
  locationName: e.location_name, address: e.address, lat: e.latitude, lng: e.longitude, osmRef: e.osm_ref,
  savedPlaceId: e.saved_place_id, visitedAt: e.visited_at, tags: e.tags ?? [], sortOrder: e.sort_order, version: e.version,
  aiAssisted: e.ai_assisted, createdAt: e.created_at, updatedAt: e.updated_at,
  photos: [...(e.travelogue_entry_media ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((m) => ({ mediaId: m.media_id, caption: m.caption })),
});

async function tripSummary(supabase: Awaited<ReturnType<typeof createClient>>, tripId: string): Promise<TripSummary | null> {
  const [trip, rec] = await Promise.all([
    supabase.from("trips").select("id, title, started_at, completed_at, route_polyline").eq("id", tripId).maybeSingle(),
    supabase.from("trip_recordings")
      .select("started_at, ended_at, total_distance_m, elapsed_duration_s, start_label, end_label, simplified_polyline")
      .eq("trip_id", tripId).eq("status", "completed").order("ended_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
  ]);
  if (!trip.data) return null;
  const r = rec.data;
  return {
    id: trip.data.id, title: trip.data.title,
    startedAt: r?.started_at ?? trip.data.started_at, endedAt: r?.ended_at ?? trip.data.completed_at,
    distanceM: r ? Number(r.total_distance_m) : null, elapsedS: r?.elapsed_duration_s ?? null,
    startLabel: r?.start_label ?? null, endLabel: r?.end_label ?? null,
    polyline: r?.simplified_polyline ?? trip.data.route_polyline ?? null,
  };
}

/** Seyahatnamenin tamamı: bölümler, yazılar (görüntüleme sırasıyla), yolculuk özeti ve imzalı fotoğraflar. */
export async function getTravelogue(id: string): Promise<Travelogue | null> {
  const supabase = await createClient();
  const { data: v, error } = await supabase.from("travelogues")
    .select("id, title, subtitle, purpose, summary, cover_media_id, ordering, status, version, created_at, updated_at, trip_id")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`TRAVELOGUE_QUERY_FAILED: ${error.message}`);
  if (!v) return null;

  const [sections, entries, trip] = await Promise.all([
    supabase.from("travelogue_sections").select("id, kind, title, content, is_visible, sort_order, version")
      .eq("travelogue_id", id).order("sort_order"),
    supabase.from("travelogue_entries").select(ENTRY_COLS).eq("travelogue_id", id).limit(500),
    v.trip_id ? tripSummary(supabase, v.trip_id) : Promise.resolve(null),
  ]);
  if (sections.error) throw new Error(`TRAVELOGUE_SECTIONS_FAILED: ${sections.error.message}`);
  if (entries.error) throw new Error(`TRAVELOGUE_ENTRIES_FAILED: ${entries.error.message}`);

  const entryList = orderEntries(((entries.data ?? []) as unknown as EntryRow[]).map(toEntry), v.ordering as "chronological" | "manual");
  const sectionList = (sections.data ?? []).map((s) => ({
    id: s.id, kind: s.kind as SectionKind, title: s.title, content: s.content as Doc | null,
    isVisible: s.is_visible, sortOrder: s.sort_order, version: s.version,
  }));

  // Fotoğraflar: yolculuğunkiler + yazılara bağlı + belgelerde geçen + kapak
  const wanted = new Set<string>();
  if (v.cover_media_id) wanted.add(v.cover_media_id);
  for (const e of entryList) {
    for (const p of e.photos) wanted.add(p.mediaId);
    for (const d of [e.introduction, e.narrative, e.historyNotes, e.personalReview]) for (const m of docMediaIds(d)) wanted.add(m);
  }
  for (const s of sectionList) for (const m of docMediaIds(s.content)) wanted.add(m);

  const rows: MediaRow[] = [];
  if (v.trip_id) {
    const { data } = await supabase.from("media_assets").select(MEDIA_COLS).eq("trip_id", v.trip_id)
      .order("taken_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(1000);
    rows.push(...((data ?? []) as MediaRow[]));
  }
  const have = new Set(rows.map((r) => r.id));
  const missing = [...wanted].filter((m) => !have.has(m));
  for (let i = 0; i < missing.length; i += 200) {
    const { data } = await supabase.from("media_assets").select(MEDIA_COLS).in("id", missing.slice(i, i + 200));
    rows.push(...((data ?? []) as MediaRow[]));
  }

  return {
    id: v.id, title: v.title, subtitle: v.subtitle, purpose: v.purpose, summary: v.summary, coverMediaId: v.cover_media_id,
    ordering: v.ordering as "chronological" | "manual", status: v.status as "draft" | "published", version: v.version,
    createdAt: v.created_at, updatedAt: v.updated_at, trip, sections: sectionList, entries: entryList,
    media: await toMediaItems(supabase, rows),
  };
}

export async function getTravelogueIdForTrip(tripId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("travelogues").select("id").eq("trip_id", tripId).maybeSingle();
  return data?.id ?? null;
}
