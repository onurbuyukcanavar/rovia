import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { RouteOption, RouteOptions, Stop } from "@/lib/maps/types";

/** Planlayıcıda düzenlenecek yolculuk (istemci bileşenine aktarılır; yalnızca serileştirilebilir alanlar). */
export type EditableTrip = {
  id: string;
  version: number;
  status: string;
  title: string;
  description: string | null;
  plannedDate: string | null;
  /** Başlangıç, ara duraklar, varış — sırayla */
  stops: Stop[];
  /** Kaydedilmiş rota; rota servisine ulaşılamazsa gösterilir */
  route: RouteOption | null;
  routeOptions: RouteOptions;
};

export type TripListItem = {
  id: string;
  title: string;
  status: string;
  plannedDate: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  stopCount: number;
  origin: string | null;
  destination: string | null;
  updatedAt: string;
};

const legsSchema = z.array(z.object({ d: z.number(), s: z.number() }));

/** RLS altında: başkasına ait ya da olmayan yolculuk için null döner. */
export async function getTripForEdit(id: string): Promise<EditableTrip | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();

  const [trip, stops] = await Promise.all([
    supabase
      .from("trips")
      .select("id, version, status, title, description, planned_date, route_polyline, route_distance_m, route_duration_s, route_legs, route_has_toll, route_has_ferry, route_options")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("trip_stops")
      .select("id, name, address, latitude, longitude, osm_ref, stop_order")
      .eq("trip_id", id)
      .order("stop_order", { ascending: true }),
  ]);
  if (trip.error) throw new Error(`TRIP_QUERY_FAILED: ${trip.error.message}`);
  if (stops.error) throw new Error(`TRIP_QUERY_FAILED: ${stops.error.message}`);
  if (!trip.data) return null;

  const t = trip.data;
  const legs = legsSchema.safeParse(t.route_legs);
  const route: RouteOption | null =
    t.route_polyline && t.route_distance_m !== null && t.route_duration_s !== null && legs.success
      ? {
          encodedPolyline: t.route_polyline,
          distanceMeters: t.route_distance_m,
          durationSeconds: t.route_duration_s,
          legs: legs.data.map((l) => ({ distanceMeters: l.d, durationSeconds: l.s })),
          hasToll: t.route_has_toll,
          hasFerry: t.route_has_ferry,
          hasHighway: false,
        }
      : null;

  return {
    id: t.id,
    version: t.version,
    status: t.status,
    title: t.title,
    description: t.description,
    plannedDate: t.planned_date,
    stops: (stops.data ?? []).map((s) => ({
      id: s.id,
      label: s.name,
      address: s.address,
      ref: s.osm_ref,
      location: { lat: s.latitude, lng: s.longitude },
    })),
    route,
    routeOptions: {
      avoidTolls: Boolean((t.route_options as Record<string, unknown> | null)?.avoid_tolls),
      avoidHighways: Boolean((t.route_options as Record<string, unknown> | null)?.avoid_highways),
      avoidFerries: Boolean((t.route_options as Record<string, unknown> | null)?.avoid_ferries),
    },
  };
}

/** Planlanmış yolculuklar: tarihi yakın olan önce, tarihsizler en sonda (en son düzenlenen önce). */
export async function listPlannedTrips(): Promise<TripListItem[]> {
  const supabase = await createClient();
  const { data: trips, error } = await supabase
    .from("trips")
    .select("id, title, status, planned_date, route_distance_m, route_duration_s, updated_at")
    .eq("status", "planned")
    .order("planned_date", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`TRIPS_QUERY_FAILED: ${error.message}`);
  if (!trips?.length) return [];

  const { data: stops, error: stopsError } = await supabase
    .from("trip_stops")
    .select("trip_id, kind, name")
    .in("trip_id", trips.map((t) => t.id));
  if (stopsError) throw new Error(`TRIPS_QUERY_FAILED: ${stopsError.message}`);

  const byTrip = new Map<string, { count: number; origin: string | null; destination: string | null }>();
  for (const s of stops ?? []) {
    const e = byTrip.get(s.trip_id) ?? { count: 0, origin: null, destination: null };
    e.count += 1;
    if (s.kind === "origin") e.origin = s.name;
    if (s.kind === "destination") e.destination = s.name;
    byTrip.set(s.trip_id, e);
  }

  return trips.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    plannedDate: t.planned_date,
    distanceMeters: t.route_distance_m,
    durationSeconds: t.route_duration_s,
    stopCount: byTrip.get(t.id)?.count ?? 0,
    origin: byTrip.get(t.id)?.origin ?? null,
    destination: byTrip.get(t.id)?.destination ?? null,
    updatedAt: t.updated_at,
  }));
}

/** Keşfet: rotası kaydedilmiş planlanmış / süren yolculuklar (RLS altında yalnızca kullanıcınınkiler). */
export async function listRouteTrips(): Promise<{ id: string; title: string; status: string; polyline: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select("id, title, status, route_polyline")
    .in("status", ["planned", "active"])
    .not("route_polyline", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`TRIPS_QUERY_FAILED: ${error.message}`);
  return (data ?? []).filter((t) => t.route_polyline).map((t) => ({ id: t.id, title: t.title, status: t.status, polyline: t.route_polyline! }));
}
