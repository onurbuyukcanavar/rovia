"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { ensureRecordingSummary } from "@/lib/recordings/server";
import type { RawPoint } from "@/lib/gps/filter";
import { t } from "@/i18n";

export type RemoteRecording = {
  recordingId: string;
  tripId: string;
  title: string;
  startedAt: number;
  status: "recording" | "paused";
  openSegment: { id: string; startedAt: number } | null;
  points: { s: string; p: RawPoint }[];
};

const trackSchema = z.object({
  status: z.enum(["recording", "paused", "completed", "cancelled"]),
  started_at: z.string(),
  segments: z.array(z.object({
    id: z.string(),
    started_at: z.string(),
    ended_at: z.string().nullable(),
    points: z.array(z.tuple([z.number(), z.number(), z.number(), z.number().nullable(), z.number().nullable()])),
  })),
});

/** Başka cihazda süren kaydı bu cihaza almak için iz ve açık bölüm. */
export async function loadActiveRecording(recordingId: string): Promise<RemoteRecording | null> {
  await requireUser();
  if (!z.uuid().safeParse(recordingId).success) return null;
  const supabase = await createClient();
  const [{ data }, { data: rec }] = await Promise.all([
    supabase.rpc("recording_track", { p_id: recordingId }),
    supabase.from("trip_recordings").select("trip_id, trips(title)").eq("id", recordingId).maybeSingle(),
  ]);
  const track = trackSchema.safeParse(data);
  if (!track.success || !rec || (track.data.status !== "recording" && track.data.status !== "paused")) return null;
  const open = track.data.segments.find((s) => s.ended_at === null) ?? null;
  return {
    recordingId,
    tripId: rec.trip_id,
    title: (rec as unknown as { trips: { title: string } | null }).trips?.title ?? "",
    startedAt: Date.parse(track.data.started_at),
    status: track.data.status,
    openSegment: open && track.data.status === "recording" ? { id: open.id, startedAt: Date.parse(open.started_at) } : null,
    points: track.data.segments.flatMap((s) => s.points.map(([t, lat, lng, acc, spd]) => ({ s: s.id, p: { t, lat, lng, acc, spd } }))),
  };
}

/** Ham GPS noktalarını siler; özet ve sadeleştirilmiş rota kalır (gerekirse önce özet üretilir). */
export async function deleteRawPoints(tripId: string, recordingId: string): Promise<{ ok: boolean; message?: string }> {
  await requireUser();
  if (!z.uuid().safeParse(recordingId).success || !z.uuid().safeParse(tripId).success) return { ok: false, message: t.common.unexpectedError };
  const supabase = await createClient();
  const { data: rec } = await supabase.from("trip_recordings").select("status").eq("id", recordingId).eq("trip_id", tripId).maybeSingle();
  if (!rec || rec.status !== "completed") return { ok: false, message: t.recording.errors.recording_not_found };
  try {
    await ensureRecordingSummary(supabase, recordingId);
  } catch {
    return { ok: false, message: t.common.unexpectedError };
  }
  const { error } = await supabase.from("gps_points").delete().eq("recording_id", recordingId);
  if (error) {
    console.error("[rovia] GPS noktaları silinemedi:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  revalidatePath(`/yolculuklar/${tripId}`);
  return { ok: true };
}
