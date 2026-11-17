"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { t } from "@/i18n";

type Fail = { ok: false; message: string };
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
const E = () => t.tools.import.errors;

async function limited(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: "journal" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return data === true;
}

function dbMessage(m: string) {
  if (/trip_not_found|not_found/.test(m)) return E().tripNotFound;
  if (/trip_active/.test(m)) return E().tripActive;
  if (/trip_has_recording/.test(m)) return E().tripHasRecording;
  if (/trip_not_editable/.test(m)) return E().tripNotEditable;
  if (/too_many_trips/.test(m)) return E().tooManyTrips;
  if (/invalid_/.test(m)) return E().invalidTrack;
  return t.common.unexpectedError;
}

const polyline = z.string().min(2).max(200_000).regex(/^[?-~]+( [?-~]+)*$/);
const importSchema = z.object({
  tripId: z.uuid().nullable(),
  title: z.string().trim().max(160).nullable(),
  source: z.enum(["gpx", "kml"]),
  payload: z.object({
    mode: z.enum(["recording", "route"]),
    polyline,
    distanceM: z.number().min(0).max(50_000_000),
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    movingS: z.number().int().min(0).nullable(),
    pointCount: z.number().int().min(2).max(200_000),
    stops: z.array(z.object({ name: z.string().trim().max(200).nullable(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })).min(2).max(20),
    legs: z.array(z.object({ d: z.number().min(0), s: z.number().min(0) })).max(19).nullable(),
  }),
});
export type ImportTrackInput = z.input<typeof importSchema>;

/** İçe aktarılan izi yeni yolculuk olarak ya da mevcut yolculuğa kaydeder (trip_import_track). */
export async function importTrack(input: ImportTrackInput): Promise<{ ok: true; id: string; href: string } | Fail> {
  await requireUser();
  const p = importSchema.safeParse(input);
  if (!p.success) return { ok: false, message: E().invalidTrack };
  const { tripId, title, source, payload } = p.data;
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };

  // Adı olmayan uç noktalar: yerel adres verisinden yer adı, yoksa "Başlangıç"/"Bitiş"
  const label = async (lat: number, lng: number) => {
    const r = await supabase.rpc("reverse_geocode", { p_lat: lat, p_lng: lng });
    return r.data?.[0]?.label?.slice(0, 200) || null;
  };
  const stops = await Promise.all(
    payload.stops.map(async (s, i, arr) => ({
      name: s.name || (i === 0 || i === arr.length - 1 ? await label(s.lat, s.lng) : null) ||
        (i === 0 ? t.tools.import.start : i === arr.length - 1 ? t.tools.import.end : t.tools.export.stopType),
      lat: s.lat,
      lng: s.lng,
    })),
  );

  const { data, error } = await supabase.rpc("trip_import_track" as never, {
    p_trip_id: tripId,
    p_title: title || t.tools.import.defaultTitle,
    p_mode: payload.mode,
    p_polyline: payload.polyline,
    p_distance_m: payload.distanceM,
    p_started_at: payload.startedAt,
    p_ended_at: payload.endedAt,
    p_moving_s: payload.movingS,
    p_point_count: payload.pointCount,
    p_stops: stops,
    p_legs: payload.legs,
    p_source: source,
  } as never);
  if (error || !data) {
    if (error && !/invalid_|trip_|too_many/.test(error.message ?? "")) console.error("[rovia] İz içe aktarılamadı:", error.code, error.message);
    return { ok: false, message: dbMessage(error?.message ?? "") };
  }
  const id = data as unknown as string;
  revalidatePath("/yolculuklar");
  revalidatePath("/panel");
  revalidatePath(`/yolculuklar/${id}`);
  return { ok: true, id, href: payload.mode === "route" ? `/planla/${id}` : `/yolculuklar/${id}` };
}

/** "Rotayı tekrar kullan": yolculuğu yeni plan olarak kopyalar ve planlayıcıya yönlendirir. */
export async function reuseTrip(tripId: string, title: string): Promise<Fail> {
  await requireUser();
  if (!z.uuid().safeParse(tripId).success) return { ok: false, message: t.tools.reuse.error };
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { data, error } = await supabase.rpc("trip_copy", { p_trip_id: tripId, p_title: t.tools.reuse.copyTitle(z.string().max(160).catch("").parse(title)) });
  if (error || !data) {
    console.error("[rovia] Rota kopyalanamadı:", error?.code, error?.message);
    return { ok: false, message: t.tools.reuse.error };
  }
  // Yalnızca GPS ile kaydedilmiş (durağı olmayan) yolculuk: kaydın başlangıç ve bitişi plan durağı olur
  const { count } = await supabase.from("trip_stops").select("id", { count: "exact", head: true }).eq("trip_id", data);
  if (!count) {
    const { data: rec } = await supabase.from("trip_recordings")
      .select("start_latitude, start_longitude, end_latitude, end_longitude, start_label, end_label")
      .eq("trip_id", tripId).eq("status", "completed").order("ended_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (rec?.start_latitude != null && rec.start_longitude != null && rec.end_latitude != null && rec.end_longitude != null) {
      const user = (await supabase.auth.getClaims()).data?.claims?.sub;
      if (user) {
        await supabase.from("trip_stops").insert([
          { trip_id: data, user_id: user, kind: "origin", stop_order: 0, name: rec.start_label || t.tools.import.start, latitude: rec.start_latitude, longitude: rec.start_longitude },
          { trip_id: data, user_id: user, kind: "destination", stop_order: 1, name: rec.end_label || t.tools.import.end, latitude: rec.end_latitude, longitude: rec.end_longitude },
        ]);
      }
    }
  }
  revalidatePath("/yolculuklar");
  redirect(`/planla/${data}`);
}
