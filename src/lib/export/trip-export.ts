import "server-only";
import { createClient } from "@/lib/supabase/server";
import { decodePolyline } from "@/lib/geo";
import { decodeTrack } from "@/lib/gps/track";
import type { ExportDoc, ExportPoint, ExportWaypoint } from "./xml";
import { t } from "@/i18n";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const T = t.tools.export;
const MAX_RAW_POINTS = 200_000;
const PAGE = 1000;
const short = (s: string | null | undefined, max = 300) => {
  const v = s?.replace(/\s+/g, " ").trim();
  return v ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : null;
};

/** Ham GPS noktaları (zaman sırasıyla, bölümlere ayrılmış). Saklama süresiyle silinmişse boş döner. */
async function rawSegments(db: Supabase, recordingId: string): Promise<ExportPoint[][]> {
  const segments: ExportPoint[][] = [];
  let current: ExportPoint[] = [];
  let lastSeg: string | null | undefined;
  for (let from = 0; from < MAX_RAW_POINTS; from += PAGE) {
    const { data, error } = await db
      .from("gps_points")
      .select("recorded_at, latitude, longitude, altitude_m, segment_id")
      .eq("recording_id", recordingId)
      .order("recorded_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`EXPORT_POINTS_FAILED: ${error.message}`);
    for (const p of data ?? []) {
      if (lastSeg !== undefined && p.segment_id !== lastSeg && current.length) {
        segments.push(current);
        current = [];
      }
      lastSeg = p.segment_id;
      current.push({ lat: p.latitude, lng: p.longitude, ele: p.altitude_m, time: p.recorded_at });
    }
    if (!data || data.length < PAGE) break;
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Yolculuğun dışa aktarma modeli (RLS altında; başkasının yolculuğu → null). */
export async function loadTripExport(id: string): Promise<ExportDoc | null> {
  const db = await createClient();
  const { data: trip, error } = await db
    .from("trips")
    .select("id, title, description, status, started_at, completed_at, created_at, route_polyline")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`EXPORT_TRIP_FAILED: ${error.message}`);
  if (!trip) return null;

  const [stops, rec, notes, travelogue] = await Promise.all([
    db.from("trip_stops").select("kind, name, address, latitude, longitude, notes").eq("trip_id", id).order("stop_order"),
    db.from("trip_recordings").select("id, started_at, simplified_polyline").eq("trip_id", id).eq("status", "completed")
      .order("ended_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    db.from("journal_notes").select("kind, title, body, location_name, latitude, longitude, noted_at").eq("trip_id", id)
      .not("latitude", "is", null).order("noted_at").limit(2000),
    db.from("travelogues").select("id").eq("trip_id", id).maybeSingle(),
  ]);

  const waypoints: ExportWaypoint[] = [];
  for (const s of stops.data ?? []) {
    if (s.latitude === null || s.longitude === null) continue;
    const kind = s.kind as keyof typeof T.stop;
    waypoints.push({ name: s.name, lat: s.latitude, lng: s.longitude, type: T.stopType, description: [T.stop[kind] ?? null, short(s.address), short(s.notes)].filter(Boolean).join(" · ") || null });
  }
  for (const n of notes.data ?? []) {
    if (n.latitude === null || n.longitude === null) continue;
    const name = short(n.title, 120) ?? short(n.location_name, 120) ?? short(n.body, 60) ?? T.noteType;
    waypoints.push({ name, lat: n.latitude, lng: n.longitude, time: n.noted_at, type: T.noteType, description: short(n.body) });
  }
  if (travelogue.data) {
    const { data: entries } = await db.from("travelogue_entries")
      .select("title, location_name, content_text, latitude, longitude, visited_at")
      .eq("travelogue_id", travelogue.data.id).not("latitude", "is", null).limit(500);
    for (const e of entries ?? []) {
      if (e.latitude === null || e.longitude === null) continue;
      waypoints.push({
        name: short(e.title, 120) ?? short(e.location_name, 120) ?? T.entryType,
        lat: e.latitude, lng: e.longitude, time: e.visited_at, type: T.entryType, description: short(e.content_text),
      });
    }
  }

  let track: ExportDoc["track"] = null;
  if (rec.data) {
    const raw = await rawSegments(db, rec.data.id);
    const segments = raw.some((s) => s.length > 1) ? raw : decodeTrack(rec.data.simplified_polyline);
    if (segments.length) track = { name: T.trackName, segments };
  }
  // Planlanan rota yalnızca iz yoksa (iz varsa çift çizgi olmasın)
  const route = !track && trip.route_polyline ? { name: T.routeName, points: decodePolyline(trip.route_polyline) } : null;

  return {
    name: trip.title,
    description: trip.description,
    time: rec.data?.started_at ?? trip.started_at ?? trip.created_at,
    track,
    route,
    waypoints,
  };
}
