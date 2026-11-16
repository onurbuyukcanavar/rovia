"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { docToText, sanitizeDoc, type Doc } from "@/lib/travelogue/doc";
import { ENTRY_TYPES, RICH_FIELDS, type SaveResult } from "@/lib/travelogue/types";
import { t } from "@/i18n";

type Fail = { ok: false; message: string };
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type DbError = { code?: string; message?: string; details?: string } | null;

const E = () => t.travelogue.errors;

async function limited(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: "travelogue" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return data === true;
}

function dbMessage(error: DbError) {
  const m = error?.message ?? "";
  if (/not_found/.test(m)) return E().notFound;
  if (/title_required/.test(m)) return E().titleRequired;
  if (/too_many/.test(m)) return E().tooMany;
  if (/invalid_location/.test(m)) return E().invalidLocation;
  if (/check constraint|invalid_patch|too large|size/.test(m)) return E().tooLarge;
  return t.common.unexpectedError;
}

function saveResult(data: unknown, error: DbError): SaveResult {
  if (error) {
    if (/version_conflict/.test(error.message ?? "")) {
      return { ok: false, conflict: true, serverVersion: Number(error.details) || 0, message: E().conflict };
    }
    console.error("[rovia] Seyahatname kaydedilemedi:", error.code, error.message);
    return { ok: false, message: dbMessage(error) };
  }
  const r = data as { version: number; updated_at: string };
  return { ok: true, version: r.version, updatedAt: r.updated_at };
}

const paths = (id?: string) => {
  revalidatePath("/seyahatnameler");
  revalidatePath("/panel");
  if (id) revalidatePath(`/seyahatnameler/${id}`, "layout");
};

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max).nullable();

// ---------------------------------------------------------------------------- Seyahatname
export async function createTravelogue(input: { tripId: string | null; title: string | null; importNotes: boolean }):
  Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const p = z.object({ tripId: uuid.nullable(), title: text(200), importNotes: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, message: E().invalid };
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { data, error } = await supabase.rpc("travelogue_create", {
    p_trip_id: p.data.tripId, p_title: p.data.title, p_import_notes: p.data.importNotes,
  } as never);
  if (error || !data) return { ok: false, message: dbMessage(error) };
  paths(data as string);
  if (p.data.tripId) revalidatePath(`/yolculuklar/${p.data.tripId}`);
  return { ok: true, id: data as string };
}

const travelogueVersioned = z.object({
  id: uuid, version: z.number().int().min(1), force: z.boolean().default(false),
  patch: z.object({
    title: z.string().trim().min(1).max(200),
    subtitle: text(300),
    purpose: text(2000),
    summary: text(5000),
    coverMediaId: uuid.nullable(),
    ordering: z.enum(["chronological", "manual"]),
    status: z.enum(["draft", "published"]),
  }).partial(),
});

export async function saveTravelogue(input: z.input<typeof travelogueVersioned>): Promise<SaveResult> {
  await requireUser();
  const p = travelogueVersioned.safeParse(input);
  if (!p.success) return { ok: false, message: E().invalid };
  const { patch } = p.data;
  const dbPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) dbPatch.title = patch.title;
  if (patch.subtitle !== undefined) dbPatch.subtitle = patch.subtitle;
  if (patch.purpose !== undefined) dbPatch.purpose = patch.purpose;
  if (patch.summary !== undefined) dbPatch.summary = patch.summary;
  if (patch.coverMediaId !== undefined) dbPatch.cover_media_id = patch.coverMediaId;
  if (patch.ordering !== undefined) dbPatch.ordering = patch.ordering;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { data, error } = await supabase.rpc("travelogue_save", {
    p_id: p.data.id, p_version: p.data.version, p_patch: dbPatch, p_force: p.data.force,
  } as never);
  const r = saveResult(data, error);
  if (r.ok && (patch.title !== undefined || patch.coverMediaId !== undefined || patch.ordering !== undefined || patch.status !== undefined)) {
    paths(p.data.id);
  }
  return r;
}

export async function deleteTravelogue(id: string): Promise<{ ok: true } | Fail> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: E().notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("travelogues").delete().eq("id", id).select("id, trip_id");
  if (error || !data?.length) return { ok: false, message: error ? t.common.unexpectedError : E().notFound };
  paths();
  if (data[0].trip_id) revalidatePath(`/yolculuklar/${data[0].trip_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------- Bölümler
const sectionVersioned = z.object({
  id: uuid, version: z.number().int().min(1), force: z.boolean().default(false),
  patch: z.object({ title: z.string().trim().min(1).max(200), content: z.unknown(), isVisible: z.boolean() }).partial(),
});

export async function saveSection(input: z.input<typeof sectionVersioned>): Promise<SaveResult> {
  await requireUser();
  const p = sectionVersioned.safeParse(input);
  if (!p.success) return { ok: false, message: E().invalid };
  const dbPatch: Record<string, unknown> = {};
  if (p.data.patch.title !== undefined) dbPatch.title = p.data.patch.title;
  if (p.data.patch.isVisible !== undefined) dbPatch.is_visible = p.data.patch.isVisible;
  if ("content" in p.data.patch) dbPatch.content = sanitizeDoc(p.data.patch.content);
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { data, error } = await supabase.rpc("travelogue_section_save", {
    p_id: p.data.id, p_version: p.data.version, p_patch: dbPatch, p_force: p.data.force,
  } as never);
  return saveResult(data, error);
}

export async function addSection(travelogueId: string, title: string): Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const p = z.object({ id: uuid, title: z.string().trim().min(1).max(200) }).safeParse({ id: travelogueId, title });
  if (!p.success) return { ok: false, message: E().titleRequired };
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { data, error } = await supabase.rpc("travelogue_section_add", { p_travelogue_id: p.data.id, p_title: p.data.title });
  if (error || !data) return { ok: false, message: dbMessage(error) };
  paths(p.data.id);
  return { ok: true, id: data as string };
}

/** Yalnızca kullanıcının eklediği (özel) bölümler silinir; hazır bölümler gizlenir. */
export async function deleteSection(id: string): Promise<{ ok: true } | Fail> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: E().notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("travelogue_sections").delete().eq("id", id).eq("kind", "custom").select("travelogue_id");
  if (error || !data?.length) return { ok: false, message: error ? t.common.unexpectedError : E().notFound };
  paths(data[0].travelogue_id);
  return { ok: true };
}

export async function reorderTravelogue(travelogueId: string, kind: "sections" | "entries", ids: string[]): Promise<{ ok: true } | Fail> {
  await requireUser();
  const p = z.object({ id: uuid, kind: z.enum(["sections", "entries"]), ids: z.array(uuid).min(1).max(500) })
    .safeParse({ id: travelogueId, kind, ids });
  if (!p.success) return { ok: false, message: E().invalid };
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { error } = await supabase.rpc("travelogue_reorder", { p_travelogue_id: p.data.id, p_kind: p.data.kind, p_ids: p.data.ids });
  if (error) return { ok: false, message: /invalid_order/.test(error.message) ? E().staleOrder : dbMessage(error) };
  paths(p.data.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------- Yazılar
const tags = z.array(z.string().trim().min(1).max(40)).max(20);
const entryFields = z.object({
  entryType: z.enum(ENTRY_TYPES),
  title: z.string().trim().max(200),
  locationName: text(200),
  address: text(500),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  osmRef: z.string().regex(/^[nwr][0-9]+$/).nullable(),
  savedPlaceId: uuid.nullable(),
  visitedAt: z.iso.datetime({ offset: true }).nullable(),
  tags,
}).partial();
export type EntryFields = z.input<typeof entryFields>;

function fieldsToDb(f: z.output<typeof entryFields>) {
  const o: Record<string, unknown> = {};
  if (f.entryType !== undefined) o.entry_type = f.entryType;
  if (f.title !== undefined) o.title = f.title;
  if (f.locationName !== undefined) o.location_name = f.locationName;
  if (f.address !== undefined) o.address = f.address;
  if (f.osmRef !== undefined) o.osm_ref = f.osmRef;
  if (f.savedPlaceId !== undefined) o.saved_place_id = f.savedPlaceId;
  if (f.visitedAt !== undefined) o.visited_at = f.visitedAt;
  if (f.tags !== undefined) o.tags = [...new Set(f.tags.map((x) => x.toLocaleLowerCase("tr")))];
  return o;
}

export async function createEntry(travelogueId: string, fields: EntryFields = {}): Promise<{ ok: true; id: string } | Fail> {
  await requireUser();
  const id = uuid.safeParse(travelogueId);
  const f = entryFields.safeParse(fields);
  if (!id.success || !f.success) return { ok: false, message: E().invalid };
  if ((f.data.lat == null) !== (f.data.lng == null)) return { ok: false, message: E().invalidLocation };
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const db = fieldsToDb(f.data);
  if (f.data.lat != null) { db.lat = f.data.lat; db.lng = f.data.lng; }
  const { data, error } = await supabase.rpc("travelogue_entry_create", { p_travelogue_id: id.data, p_fields: db } as never);
  if (error || !data) return { ok: false, message: dbMessage(error) };
  paths(id.data);
  return { ok: true, id: data as string };
}

const richPatch = z.object({
  introduction: z.unknown(), narrative: z.unknown(), historyNotes: z.unknown(), personalReview: z.unknown(),
}).partial();
const entryVersioned = z.object({
  id: uuid, version: z.number().int().min(1), force: z.boolean().default(false),
  patch: entryFields.extend(richPatch.shape),
});
const RICH_KEYS = { introduction: "introduction", narrative: "narrative", historyNotes: "history_notes", personalReview: "personal_review" } as const;

/**
 * Otomatik kayıt. Zengin metin sunucuda temizlenir; düz metin (content_text) tüm alanlardan
 * yeniden üretilir. Konum alanları birlikte gönderilmelidir (lat/lng çifti).
 */
export async function saveEntry(input: z.input<typeof entryVersioned>): Promise<SaveResult> {
  await requireUser();
  const p = entryVersioned.safeParse(input);
  if (!p.success) return { ok: false, message: E().invalid };
  const { patch } = p.data;
  const dbPatch = fieldsToDb(patch);
  if (patch.lat !== undefined || patch.lng !== undefined) {
    if ((patch.lat ?? null) === null !== ((patch.lng ?? null) === null)) return { ok: false, message: E().invalidLocation };
    dbPatch.latitude = patch.lat ?? null;
    dbPatch.longitude = patch.lng ?? null;
  }
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };

  const richChanged = (Object.keys(RICH_KEYS) as (keyof typeof RICH_KEYS)[]).filter((k) => k in patch);
  if (richChanged.length || patch.title !== undefined) {
    const { data: cur, error } = await supabase.from("travelogue_entries")
      .select("title, introduction, narrative, history_notes, personal_review").eq("id", p.data.id).maybeSingle();
    if (error || !cur) return { ok: false, message: E().notFound };
    const docs: Record<string, Doc | null> = {
      introduction: cur.introduction as Doc | null, narrative: cur.narrative as Doc | null,
      history_notes: cur.history_notes as Doc | null, personal_review: cur.personal_review as Doc | null,
    };
    for (const k of richChanged) {
      const clean = sanitizeDoc(patch[k]);
      docs[RICH_KEYS[k]] = clean;
      dbPatch[RICH_KEYS[k]] = clean;
    }
    const title = patch.title ?? cur.title;
    dbPatch.content_text = [title, ...RICH_FIELDS.map((f) => docToText(docs[f]))].filter(Boolean).join("\n\n").slice(0, 300_000) || null;
  }

  const { data, error } = await supabase.rpc("travelogue_entry_save", {
    p_id: p.data.id, p_version: p.data.version, p_patch: dbPatch, p_force: p.data.force,
  } as never);
  return saveResult(data, error);
}

export async function deleteEntry(id: string): Promise<{ ok: true } | Fail> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, message: E().notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("travelogue_entries").delete().eq("id", id).select("travelogue_id");
  if (error || !data?.length) return { ok: false, message: error ? t.common.unexpectedError : E().notFound };
  paths(data[0].travelogue_id);
  return { ok: true };
}

/** Yazının fotoğraf listesinin tamamı (sırasıyla, yazıya özel açıklamayla). */
export async function setEntryPhotos(entryId: string, items: { mediaId: string; caption: string | null }[]): Promise<{ ok: true } | Fail> {
  await requireUser();
  const p = z.object({
    id: uuid, items: z.array(z.object({ mediaId: uuid, caption: z.string().trim().max(2000).nullable() })).max(60),
  }).safeParse({ id: entryId, items });
  if (!p.success) return { ok: false, message: E().invalid };
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E().rateLimited };
  const { error } = await supabase.rpc("travelogue_entry_set_media", {
    p_entry_id: p.data.id, p_items: p.data.items.map((i) => ({ id: i.mediaId, caption: i.caption })),
  } as never);
  if (error) return { ok: false, message: dbMessage(error) };
  return { ok: true };
}

// ---------------------------------------------------------------------------- Yazı geçmişi
export type EntryRevision = { id: number; version: number; createdAt: string; title: string; preview: string };

export async function listEntryRevisions(entryId: string): Promise<{ ok: true; revisions: EntryRevision[] } | Fail> {
  await requireUser();
  if (!uuid.safeParse(entryId).success) return { ok: false, message: E().notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("travelogue_entry_revisions").select("id, version, created_at, snapshot")
    .eq("entry_id", entryId).order("created_at", { ascending: false }).limit(50);
  if (error) return { ok: false, message: t.common.unexpectedError };
  return {
    ok: true,
    revisions: (data ?? []).map((r) => {
      const s = r.snapshot as { title?: string; content_text?: string | null };
      return { id: r.id, version: r.version, createdAt: r.created_at, title: s.title ?? "", preview: (s.content_text ?? "").slice(0, 240) };
    }),
  };
}

/** Eski sürümü geri yükler (geri yükleme de yeni bir sürüm olarak kaydedilir; mevcut hâl geçmişe eklenir). */
export async function restoreEntryRevision(entryId: string, revisionId: number): Promise<SaveResult> {
  await requireUser();
  if (!uuid.safeParse(entryId).success || !Number.isInteger(revisionId)) return { ok: false, message: E().notFound };
  const supabase = await createClient();
  const { data: rev } = await supabase.from("travelogue_entry_revisions").select("snapshot").eq("id", revisionId).eq("entry_id", entryId).maybeSingle();
  const { data: cur } = await supabase.from("travelogue_entries").select("version").eq("id", entryId).maybeSingle();
  if (!rev || !cur) return { ok: false, message: E().notFound };
  const s = rev.snapshot as Record<string, unknown>;
  const keys = ["title", "entry_type", "introduction", "narrative", "history_notes", "personal_review", "content_text",
    "location_name", "address", "latitude", "longitude", "osm_ref", "saved_place_id", "visited_at", "tags"];
  const patch = Object.fromEntries(keys.filter((k) => k in s).map((k) => [k, s[k]]));
  const { data, error } = await supabase.rpc("travelogue_entry_save", { p_id: entryId, p_version: cur.version, p_patch: patch, p_force: true } as never);
  return saveResult(data, error);
}

// ---------------------------------------------------------------------------- Seyahatnameye ekle
const placeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: text(500).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  osmRef: z.string().regex(/^[nwr][0-9]+$/).nullable().optional(),
  savedPlaceId: uuid.nullable().optional(),
  visitedAt: z.iso.datetime({ offset: true }).nullable().optional(),
});

/** Bir yeri mevcut ya da yeni bir seyahatnameye yazı olarak ekler. */
export async function addPlaceToTravelogue(input: {
  travelogueId: string | null; newTitle?: string | null; place: z.input<typeof placeSchema>;
}): Promise<{ ok: true; travelogueId: string; entryId: string } | Fail> {
  await requireUser();
  const place = placeSchema.safeParse(input.place);
  if (!place.success) return { ok: false, message: E().invalid };
  let travelogueId = input.travelogueId;
  if (!travelogueId) {
    const c = await createTravelogue({ tripId: null, title: input.newTitle ?? null, importNotes: false });
    if (!c.ok) return c;
    travelogueId = c.id;
  }
  const r = await createEntry(travelogueId, {
    entryType: "place", title: place.data.name, locationName: place.data.name, address: place.data.address ?? null,
    lat: place.data.lat, lng: place.data.lng, osmRef: place.data.osmRef ?? null, savedPlaceId: place.data.savedPlaceId ?? null,
    visitedAt: place.data.visitedAt ?? null,
  });
  if (!r.ok) return r;
  return { ok: true, travelogueId, entryId: r.id };
}

export async function getTravelogueTargets(): Promise<{ id: string; title: string; tripTitle: string | null }[]> {
  await requireUser();
  const { listTravelogueTargets } = await import("@/lib/queries/travelogue");
  return listTravelogueTargets();
}
