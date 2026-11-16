"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { NOTE_KINDS } from "@/lib/journal/types";
import { t } from "@/i18n";

type Fail = { ok: false; message: string };
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function limited(supabase: SupabaseClient, bucket: "media" | "journal") {
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: bucket });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return data === true;
}

function revalidateJournal(tripId?: string | null) {
  revalidatePath("/gunluk");
  revalidatePath("/yolculuklar");
  revalidatePath("/panel");
  if (tripId) revalidatePath(`/yolculuklar/${tripId}`);
}

/** Storage'dan dosya sil (hata olursa yalnızca kaydet; veritabanı kaydı zaten silindi) */
async function removeFiles(supabase: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from("media").remove(paths.slice(i, i + 100));
    if (error) console.error("[rovia] Storage dosyası silinemedi:", error.message);
  }
}

function dbMessage(error: { code?: string; message?: string } | null) {
  const m = error?.message ?? "";
  if (/quota_exceeded/.test(m)) return t.journal.errors.quota;
  if (/upload_missing/.test(m)) return t.journal.errors.uploadMissing;
  if (/trip_not_found|note_not_found|media_not_found/.test(m)) return t.journal.errors.notFound;
  if (/empty_note/.test(m)) return t.journal.errors.empty;
  if (/invalid_type|too_large|invalid_path/.test(m)) return t.journal.errors.invalidFile;
  return t.common.unexpectedError;
}

// ---------------------------------------------------------------------------- Fotoğraflar
const mediaItemSchema = z.object({
  path: z.string().max(512),
  thumbPath: z.string().max(512),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
  takenAt: z.iso.datetime().nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
});

/** İstemcinin kendi klasörüne yüklediği dosyaları kaydeder (dosya varlığı, boyutu ve türü veritabanında doğrulanır). */
export async function registerMedia(input: { tripId: string | null; items: z.input<typeof mediaItemSchema>[] }):
  Promise<{ ok: true; ids: string[] } | Fail> {
  await requireUser();
  const parsed = z.object({ tripId: z.uuid().nullable(), items: z.array(mediaItemSchema).min(1).max(20) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t.journal.errors.invalidFile };
  const supabase = await createClient();
  if (!(await limited(supabase, "media"))) return { ok: false, message: t.journal.errors.rateLimited };

  const items = parsed.data.items.map((m) => ({
    path: m.path, thumb_path: m.thumbPath, width: m.width, height: m.height, taken_at: m.takenAt, lat: m.lat, lng: m.lng,
  }));
  const { data, error } = await supabase.rpc("media_register", { p_trip_id: parsed.data.tripId, p_items: items } as never);
  if (error || !data) {
    console.error("[rovia] Fotoğraf kaydedilemedi:", error?.code, error?.message);
    return { ok: false, message: dbMessage(error) };
  }
  revalidateJournal(parsed.data.tripId);
  return { ok: true, ids: (data as { i: number; id: string }[]).sort((a, b) => a.i - b.i).map((x) => x.id) };
}

export async function deleteMedia(ids: string[], tripId?: string | null): Promise<{ ok: true; deleted: number } | Fail> {
  await requireUser();
  const parsed = z.array(z.uuid()).min(1).max(200).safeParse(ids);
  if (!parsed.success) return { ok: false, message: t.journal.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("media_delete", { p_ids: parsed.data });
  if (error) {
    console.error("[rovia] Fotoğraf silinemedi:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  const paths = (data ?? []) as string[];
  await removeFiles(supabase, paths);
  revalidateJournal(tripId);
  return { ok: true, deleted: Math.ceil(paths.length / 2) };
}

export async function updateMediaCaption(id: string, caption: string | null, tripId?: string | null): Promise<{ ok: true } | Fail> {
  await requireUser();
  const parsed = z.object({ id: z.uuid(), caption: z.string().trim().max(2000).nullable() }).safeParse({ id, caption });
  if (!parsed.success) return { ok: false, message: t.journal.errors.invalid };
  const supabase = await createClient();
  const { data, error } = await supabase.from("media_assets").update({ caption: parsed.data.caption || null }).eq("id", parsed.data.id).select("id");
  if (error || !data?.length) return { ok: false, message: error ? t.common.unexpectedError : t.journal.errors.notFound };
  revalidateJournal(tripId);
  return { ok: true };
}

// ---------------------------------------------------------------------------- Notlar
const noteSchema = z.object({
  id: z.uuid().nullable(),
  tripId: z.uuid().nullable(),
  kind: z.enum(NOTE_KINDS),
  title: z.string().trim().max(200).nullable(),
  body: z.string().trim().max(10000).nullable(),
  notedAt: z.iso.datetime({ offset: true }).nullable(),
  locationName: z.string().trim().max(200).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  savedPlaceId: z.uuid().nullable(),
  mediaIds: z.array(z.uuid()).max(30),
});
export type NoteInput = z.input<typeof noteSchema>;

export async function saveJournalNote(input: NoteInput): Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.journal.errors.invalid };
  const n = parsed.data;
  if (!n.title && !n.body && n.mediaIds.length === 0) return { ok: false, message: t.journal.errors.empty };
  const supabase = await createClient();
  if (!(await limited(supabase, "journal"))) return { ok: false, message: t.journal.errors.rateLimited };

  const { data, error } = await supabase.rpc("journal_note_save", {
    p_id: n.id, p_trip_id: n.tripId, p_kind: n.kind, p_title: n.title, p_body: n.body, p_noted_at: n.notedAt,
    p_location_name: n.locationName, p_lat: n.lat, p_lng: n.lng, p_saved_place_id: n.savedPlaceId, p_media_ids: n.mediaIds,
  } as never);
  if (error || !data) {
    console.error("[rovia] Not kaydedilemedi:", error?.code, error?.message);
    return { ok: false, message: dbMessage(error) };
  }
  revalidateJournal(n.tripId);
  return { ok: true, id: data as string };
}

/** Notu sil; withPhotos ise nota eklenen fotoğraflar da silinir (yoksa galeride kalır). */
export async function deleteJournalNote(id: string, withPhotos: boolean): Promise<{ ok: true } | Fail> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: t.journal.errors.notFound };
  const supabase = await createClient();
  const { data: note } = await supabase.from("journal_notes").select("id, trip_id, journal_note_media(media_id)").eq("id", id).maybeSingle();
  if (!note) return { ok: false, message: t.journal.errors.notFound };
  const mediaIds = ((note.journal_note_media ?? []) as unknown as { media_id: string }[]).map((m) => m.media_id);

  const { error } = await supabase.from("journal_notes").delete().eq("id", id);
  if (error) {
    console.error("[rovia] Not silinemedi:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  if (withPhotos && mediaIds.length) {
    const { data: paths } = await supabase.rpc("media_delete", { p_ids: mediaIds });
    await removeFiles(supabase, (paths ?? []) as string[]);
  }
  revalidateJournal(note.trip_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------- Yolculuk
const tripInfoSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, { error: t.trips.errors.title }).max(160, { error: t.trips.errors.titleMax }),
  description: z.string().trim().max(5000).nullable(),
});

export async function updateTripInfo(input: z.input<typeof tripInfoSchema>): Promise<{ ok: true } | Fail> {
  await requireUser();
  const parsed = tripInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? t.journal.errors.invalid };
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips")
    .update({ title: parsed.data.title, description: parsed.data.description || null })
    .eq("id", parsed.data.id).select("id");
  if (error || !data?.length) return { ok: false, message: error ? t.common.unexpectedError : t.journal.errors.notFound };
  revalidateJournal(parsed.data.id);
  return { ok: true };
}

/** Yolculuğu sil; withJournal ise notları ve fotoğrafları da (dosyalar Storage'dan kaldırılır). */
export async function deleteTripWithJournal(id: string, withJournal: boolean): Promise<{ ok: true } | Fail> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: t.journal.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trip_delete", { p_id: id, p_with_journal: withJournal });
  if (error) {
    console.error("[rovia] Yolculuk silinemedi:", error.code, error.message);
    return { ok: false, message: /trip_not_found/.test(error.message) ? t.journal.errors.notFound : t.trips.deleteFailed };
  }
  await removeFiles(supabase, (data ?? []) as string[]);
  revalidateJournal();
  return { ok: true };
}
