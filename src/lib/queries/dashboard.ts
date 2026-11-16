import "server-only";
import { createClient } from "@/lib/supabase/server";

export type DashboardStats = {
  completed_trips: number;
  total_distance_m: number;
  total_duration_s: number;
  visited_places: number;
  travelogues: number;
  photos: number;
};

export type TripSummary = {
  id: string;
  title: string;
  status: string;
  planned_date: string | null;
  completed_at: string | null;
  route_distance_m: number | null;
  origin: string | null;
  destination: string | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

/** Paneldeki tüm veriler; her sorgu RLS altında yalnızca oturumdaki kullanıcının verisini döndürür. */
export async function getDashboardData() {
  const supabase = await createClient();

  const [stats, recent, upcoming, places, entries] = await Promise.all([
    supabase.rpc("dashboard_stats"),
    supabase
      .from("trips")
      .select("id, title, status, planned_date, completed_at, route_distance_m")
      .in("status", ["completed", "archived"])
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(4),
    supabase
      .from("trips")
      .select("id, title, status, planned_date, completed_at, route_distance_m")
      .eq("status", "planned")
      .order("planned_date", { ascending: true, nullsFirst: false })
      .limit(4),
    supabase
      .from("saved_places")
      .select("id, name, category, source, address")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("travelogue_entries")
      .select("id, title, location_name, updated_at, travelogue_id")
      .order("updated_at", { ascending: false })
      .limit(4),
  ]);

  for (const r of [stats, recent, upcoming, places, entries]) {
    if (r.error) throw new Error(`DASHBOARD_QUERY_FAILED: ${r.error.message}`);
  }

  const trips = [...(recent.data ?? []), ...(upcoming.data ?? [])];
  const endpoints = new Map<string, { origin: string | null; destination: string | null }>();
  if (trips.length) {
    const { data: stops, error } = await supabase
      .from("trip_stops")
      .select("trip_id, kind, name")
      .in("trip_id", trips.map((t) => t.id))
      .in("kind", ["origin", "destination"]);
    if (error) throw new Error(`DASHBOARD_QUERY_FAILED: ${error.message}`);
    for (const s of stops ?? []) {
      const e = endpoints.get(s.trip_id) ?? { origin: null, destination: null };
      if (s.kind === "origin") e.origin = s.name;
      else e.destination = s.name;
      endpoints.set(s.trip_id, e);
    }
  }
  const withEndpoints = (list: typeof trips): TripSummary[] =>
    list.map((t) => ({
      ...t,
      origin: endpoints.get(t.id)?.origin ?? null,
      destination: endpoints.get(t.id)?.destination ?? null,
    }));

  const travelogueIds = [...new Set((entries.data ?? []).map((e) => e.travelogue_id))];
  const titles = new Map<string, string>();
  if (travelogueIds.length) {
    const { data, error } = await supabase.from("travelogues").select("id, title").in("id", travelogueIds);
    if (error) throw new Error(`DASHBOARD_QUERY_FAILED: ${error.message}`);
    for (const tv of data ?? []) titles.set(tv.id, tv.title);
  }

  const s = (stats.data ?? {}) as Record<string, unknown>;
  return {
    stats: {
      completed_trips: num(s.completed_trips),
      total_distance_m: num(s.total_distance_m),
      total_duration_s: num(s.total_duration_s),
      visited_places: num(s.visited_places),
      travelogues: num(s.travelogues),
      photos: num(s.photos),
    } satisfies DashboardStats,
    recentTrips: withEndpoints(recent.data ?? []),
    upcomingTrips: withEndpoints(upcoming.data ?? []),
    savedPlaces: places.data ?? [],
    recentEntries: (entries.data ?? []).map((e) => ({ ...e, travelogueTitle: titles.get(e.travelogue_id) ?? null })),
  };
}
