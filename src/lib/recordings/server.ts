import "server-only";
import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";
import { summarizeTrack, type SegmentInput } from "@/lib/gps/filter";
import { encodeTrack } from "@/lib/gps/track";
import type { RecordingOp, SyncResponse } from "./ops";
import { t } from "@/i18n";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message: string };

const iso = (ms: number) => new Date(ms).toISOString();

/** SQL'in bildirdiği kalıcı hatalar: tekrar denemek sonucu değiştirmez. */
const PERMANENT_MESSAGES = [
  "recording_not_found", "segment_not_found", "recording_closed", "recording_active",
  "trip_not_found", "trip_not_startable", "invalid_time", "invalid_points",
] as const;

function classify(error: DbError): NonNullable<SyncResponse["error"]> {
  const code = PERMANENT_MESSAGES.find((m) => error.message.includes(m));
  if (code) return { code, permanent: true, message: t.recording.errors[code] };
  const permanent = ["22023", "22P02", "23514", "23503", "42501"].includes(error.code ?? "");
  return { code: permanent ? "invalid" : "unavailable", permanent, message: permanent ? t.recording.errors.invalid : t.recording.errors.unavailable };
}

/**
 * İşlemleri sırayla uygular; ilk hatada durur. Her işlem idempotent olduğundan istemci,
 * uygulanmayan kısmı daha sonra aynen tekrar gönderebilir.
 */
export async function applyRecordingOps(db: Supabase, recordingId: string, ops: RecordingOp[]): Promise<SyncResponse> {
  let tripId: string | null = null;
  let status: string | null = null;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    let error: DbError | null = null;

    switch (op.type) {
      case "start": {
        const r = await db
          .rpc("recording_start", {
            p_id: recordingId, p_segment_id: op.segmentId, p_started_at: iso(op.at), p_trip_id: op.tripId, p_title: op.title,
          } as never)
          .single<{ recording_id: string; trip_id: string; status: string }>();
        error = r.error;
        if (r.data) ({ trip_id: tripId, status } = r.data);
        break;
      }
      case "points": {
        const r = await db.rpc("recording_add_points", { p_id: recordingId, p_segment_id: op.segmentId, p_points: op.points });
        error = r.error;
        break;
      }
      case "pause":
      case "resume": {
        const fn = op.type === "pause" ? "recording_pause" : "recording_resume";
        const r = await db.rpc(fn, { p_id: recordingId, p_segment_id: op.segmentId, p_at: iso(op.at) });
        error = r.error;
        if (r.data) status = r.data;
        break;
      }
      case "finish": {
        const r = await db.rpc("recording_finish", { p_id: recordingId, p_at: iso(op.at) });
        error = r.error;
        if (r.data) {
          status = r.data;
          // Özet ayrı yazılır; başarısız olursa kayıt yine tamamlanmıştır (özet görüntülemede yeniden hesaplanır)
          try {
            await ensureRecordingSummary(db, recordingId);
          } catch (e) {
            console.error("[rovia] Kayıt özeti hesaplanamadı:", e instanceof Error ? e.message : e);
          }
        }
        break;
      }
      case "cancel": {
        const r = await db.rpc("recording_cancel", { p_id: recordingId });
        error = r.error;
        if (r.data) status = r.data;
        break;
      }
    }

    if (error) {
      const classified = classify(error);
      if (!classified.permanent) console.error(`[rovia] Kayıt işlemi (${op.type}) uygulanamadı:`, error.code, error.message);
      return { applied: i, tripId, status, error: classified };
    }
  }

  if (!tripId) {
    const { data } = await db.from("trip_recordings").select("trip_id, status").eq("id", recordingId).maybeSingle();
    if (data) ({ trip_id: tripId, status } = data);
  }
  return { applied: ops.length, tripId, status };
}

const trackSchema = z.object({
  status: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  segments: z.array(
    z.object({
      started_at: z.string(),
      ended_at: z.string().nullable(),
      points: z.array(z.tuple([z.number(), z.number(), z.number(), z.number().nullable(), z.number().nullable()])),
    }),
  ),
});

/**
 * Tamamlanmış kaydın özetini kaydedilmiş noktalardan (sunucuda, aynı GPS filtresiyle) hesaplar.
 * Özet zaten varsa dokunmaz: ham noktalar saklama süresi dolunca silinir ve özet yeniden üretilemez.
 */
export async function ensureRecordingSummary(db: Supabase, recordingId: string) {
  const { data: current } = await db
    .from("trip_recordings")
    .select("status, simplified_polyline")
    .eq("id", recordingId)
    .maybeSingle();
  if (!current || current.status !== "completed" || current.simplified_polyline !== null) return false;

  const { data, error } = await db.rpc("recording_track", { p_id: recordingId });
  if (error) throw new Error(`recording_track: ${error.message}`);
  const track = trackSchema.parse(data);
  if (!track.ended_at) return false;

  const segments: SegmentInput[] = track.segments.map((s) => ({
    startedAt: Date.parse(s.started_at),
    endedAt: s.ended_at ? Date.parse(s.ended_at) : null,
    points: s.points.map(([t, lat, lng, acc, spd]) => ({ t, lat, lng, acc, spd })),
  }));
  const summary = summarizeTrack(segments, Date.parse(track.started_at), Date.parse(track.ended_at));

  const label = async (p: { lat: number; lng: number } | null) => {
    if (!p) return null;
    const r = await db.rpc("reverse_geocode", { p_lat: p.lat, p_lng: p.lng });
    return r.data?.[0]?.label?.slice(0, 200) ?? null;
  };
  const [startLabel, endLabel] = await Promise.all([label(summary.start), label(summary.end)]);

  const { error: updateError } = await db
    .from("trip_recordings")
    .update({
      total_distance_m: summary.distanceM,
      moving_duration_s: summary.movingS,
      paused_duration_s: summary.pausedS,
      elapsed_duration_s: summary.elapsedS,
      average_speed_kmh: summary.averageKmh,
      max_speed_kmh: summary.maxKmh,
      start_latitude: summary.start?.lat ?? null,
      start_longitude: summary.start?.lng ?? null,
      end_latitude: summary.end?.lat ?? null,
      end_longitude: summary.end?.lng ?? null,
      start_label: startLabel,
      end_label: endLabel,
      point_count: summary.pointCount,
      simplified_polyline: encodeTrack(summary.paths),
    })
    .eq("id", recordingId)
    .eq("status", "completed")
    .is("simplified_polyline", null);
  if (updateError) throw new Error(`summary update: ${updateError.message}`);
  return true;
}
