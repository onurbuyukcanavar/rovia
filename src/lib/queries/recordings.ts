import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ensureRecordingSummary } from "@/lib/recordings/server";

export type PlannedTripOption = { id: string; title: string; plannedDate: string | null; routePolyline: string | null };

export type ServerActiveRecording = {
  recordingId: string;
  tripId: string;
  title: string;
  status: "recording" | "paused";
  startedAt: string;
};

/** Kayıt ekranı: başlatılabilecek planlı yolculuklar ve (varsa) sunucudaki aktif kayıt. */
export async function getRecordingPageData() {
  const supabase = await createClient();
  const [planned, active] = await Promise.all([
    supabase
      .from("trips")
      .select("id, title, planned_date, route_polyline")
      .eq("status", "planned")
      .order("planned_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(50),
    supabase
      .from("trip_recordings")
      .select("id, trip_id, status, started_at, trips(title)")
      .in("status", ["recording", "paused"])
      .maybeSingle(),
  ]);
  if (planned.error) throw new Error(`RECORDING_PAGE_QUERY_FAILED: ${planned.error.message}`);
  if (active.error) throw new Error(`RECORDING_PAGE_QUERY_FAILED: ${active.error.message}`);

  const a = active.data as unknown as { id: string; trip_id: string; status: "recording" | "paused"; started_at: string; trips: { title: string } | null } | null;
  return {
    plannedTrips: (planned.data ?? []).map((p): PlannedTripOption => ({
      id: p.id, title: p.title, plannedDate: p.planned_date, routePolyline: p.route_polyline,
    })),
    active: a
      ? ({ recordingId: a.id, tripId: a.trip_id, title: a.trips?.title ?? "", status: a.status, startedAt: a.started_at } satisfies ServerActiveRecording)
      : null,
  };
}

/** Süren kayıt (liste ve panel uyarısı için). */
export async function getActiveRecording(): Promise<{ tripId: string; title: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("trip_recordings")
    .select("trip_id, trips(title)")
    .in("status", ["recording", "paused"])
    .maybeSingle();
  if (!data) return null;
  return { tripId: data.trip_id, title: (data as unknown as { trips: { title: string } | null }).trips?.title ?? "" };
}

export type TripRecordingSummary = {
  recordingId: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  distanceM: number;
  elapsedS: number;
  movingS: number;
  pausedS: number;
  averageKmh: number | null;
  maxKmh: number | null;
  startLabel: string | null;
  endLabel: string | null;
  polyline: string | null;
  pointCount: number;
  rawPointCount: number;
};

export type TripDetail = {
  id: string;
  title: string;
  status: string;
  plannedDate: string | null;
  routePolyline: string | null;
  recording: TripRecordingSummary | null;
};

/** Yolculuk ayrıntısı + son kaydı. Özeti henüz yazılmamış tamamlanmış kayıtta özet burada üretilir. */
export async function getTripDetail(id: string): Promise<TripDetail | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data: trip, error } = await supabase
    .from("trips")
    .select("id, title, status, planned_date, route_polyline")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`TRIP_DETAIL_QUERY_FAILED: ${error.message}`);
  if (!trip) return null;

  const loadRecording = () =>
    supabase
      .from("trip_recordings")
      .select("id, status, started_at, ended_at, total_distance_m, elapsed_duration_s, moving_duration_s, paused_duration_s, average_speed_kmh, max_speed_kmh, start_label, end_label, simplified_polyline, point_count")
      .eq("trip_id", id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  let rec = (await loadRecording()).data;
  if (rec && rec.status === "completed" && rec.simplified_polyline === null) {
    try {
      if (await ensureRecordingSummary(supabase, rec.id)) rec = (await loadRecording()).data;
    } catch (e) {
      console.error("[rovia] Özet yeniden hesaplanamadı:", e instanceof Error ? e.message : e);
    }
  }
  let rawPointCount = 0;
  if (rec) {
    const { count } = await supabase.from("gps_points").select("id", { count: "exact", head: true }).eq("recording_id", rec.id);
    rawPointCount = count ?? 0;
  }

  return {
    id: trip.id,
    title: trip.title,
    status: trip.status,
    plannedDate: trip.planned_date,
    routePolyline: trip.route_polyline,
    recording: rec
      ? {
          recordingId: rec.id,
          status: rec.status,
          startedAt: rec.started_at,
          endedAt: rec.ended_at,
          distanceM: Number(rec.total_distance_m),
          elapsedS: rec.elapsed_duration_s,
          movingS: rec.moving_duration_s,
          pausedS: rec.paused_duration_s,
          averageKmh: rec.average_speed_kmh === null ? null : Number(rec.average_speed_kmh),
          maxKmh: rec.max_speed_kmh === null ? null : Number(rec.max_speed_kmh),
          startLabel: rec.start_label,
          endLabel: rec.end_label,
          polyline: rec.simplified_polyline,
          pointCount: rec.point_count,
          rawPointCount,
        }
      : null,
  };
}

export type CompletedTripItem = {
  id: string;
  title: string;
  endedAt: string | null;
  distanceM: number;
  elapsedS: number;
  startLabel: string | null;
  endLabel: string | null;
};

/** Tamamlanan yolculuklar (en yeni önce). Ayrıntılı arşiv ve filtreler Faz 6'da. */
export async function listCompletedTrips(): Promise<CompletedTripItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_recordings")
    .select("trip_id, ended_at, total_distance_m, elapsed_duration_s, start_label, end_label, trips(title)")
    .eq("status", "completed")
    .order("ended_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`COMPLETED_TRIPS_QUERY_FAILED: ${error.message}`);
  return ((data ?? []) as unknown as {
    trip_id: string; ended_at: string | null; total_distance_m: number | string; elapsed_duration_s: number;
    start_label: string | null; end_label: string | null; trips: { title: string } | null;
  }[]).map((r) => ({
    id: r.trip_id,
    title: r.trips?.title ?? "",
    endedAt: r.ended_at,
    distanceM: Number(r.total_distance_m),
    elapsedS: r.elapsed_duration_s,
    startLabel: r.start_label,
    endLabel: r.end_label,
  }));
}
