"use server";

import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, requireUser } from "@/lib/dal";
import { getSiteUrl } from "@/lib/site-url";
import { DEFAULT_PRIVACY_RADIUS, PRIVACY_RADII, SHARE_OPTION_KEYS, type ShareKind, type SharePayload, type ShareState } from "@/lib/share/types";
import { normalizeOptions, previewItems, shareStateFromRow } from "@/lib/share/view";
import { t } from "@/i18n";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type Fail = { ok: false; message: string };
export type ShareResult = { ok: true; state: ShareState; url: string | null; preview: string[] } | Fail;

const E = t.share.errors;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const shareTag = (token: string) => `share:${token}`;

const targetSchema = z.object({ kind: z.enum(["trip", "travelogue"]), id: z.uuid() });
const saveSchema = targetSchema.extend({
  visibility: z.enum(["private", "link", "public"]),
  options: z.object(Object.fromEntries(SHARE_OPTION_KEYS.map((k) => [k, z.boolean()])) as Record<(typeof SHARE_OPTION_KEYS)[number], z.ZodBoolean>),
  privacyRadiusM: z.number().int().refine((v) => (PRIVACY_RADII as readonly number[]).includes(v)),
  rotate: z.boolean().default(false),
});

async function limited(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: "journal" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return data === true;
}

function dbMessage(error: { message?: string } | null) {
  const m = error?.message ?? "";
  if (/trip_active/.test(m)) return E.tripActive;
  if (/not_found/.test(m)) return E.notFound;
  if (/invalid_arguments/.test(m)) return E.invalid;
  return t.common.unexpectedError;
}

async function activeTokens(supabase: SupabaseClient, kind: ShareKind, id: string) {
  const { data, error } = await supabase.from("shares")
    .select("visibility, token, options, privacy_radius_m")
    .eq(kind === "trip" ? "trip_id" : "travelogue_id", id).is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`SHARES_QUERY_FAILED: ${error.message}`);
  return data ?? [];
}

async function result(supabase: SupabaseClient, state: ShareState): Promise<ShareResult> {
  if (!state.token) return { ok: true, state, url: null, preview: [] };
  const { data } = await supabase.rpc("share_get", { p_token: state.token });
  const payload = data && typeof data === "object" ? (data as unknown as SharePayload) : null;
  if (payload) payload.privacyRadiusM = Number(payload.privacyRadiusM ?? 0);
  return { ok: true, state, url: `${await getSiteUrl()}/p/${state.token}`, preview: previewItems(payload) };
}

/** Bir yolculuğun / seyahatnamenin mevcut paylaşım durumu ve "Paylaşılacaklar" özeti. */
export async function getShareSettings(input: { kind: ShareKind; id: string }): Promise<ShareResult> {
  const user = await requireUser();
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: E.invalid };
  const supabase = await createClient();
  const [rows, settings] = await Promise.all([
    activeTokens(supabase, parsed.data.kind, parsed.data.id),
    supabase.from("user_settings").select("share_privacy_radius_m").eq("user_id", user.id).maybeSingle(),
  ]);
  const radius = settings.data?.share_privacy_radius_m ?? DEFAULT_PRIVACY_RADIUS;
  const state = shareStateFromRow(rows[0] ?? null, (PRIVACY_RADII as readonly number[]).includes(radius) ? radius : DEFAULT_PRIVACY_RADIUS);
  return result(supabase, state);
}

/** Paylaşım ayarlarını kaydeder ("private" bağlantıyı iptal eder; rotate eski bağlantıyı geçersiz kılar). */
export async function saveShareSettings(input: z.input<typeof saveSchema>): Promise<ShareResult> {
  await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: E.invalid };
  const d = parsed.data;
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E.rateLimited };

  const before = await activeTokens(supabase, d.kind, d.id);
  const { data, error } = await supabase.rpc("share_set", {
    p_kind: d.kind, p_target: d.id, p_visibility: d.visibility, p_options: d.options,
    p_privacy_radius_m: d.privacyRadiusM, p_rotate: d.rotate,
  });
  if (error || !data) {
    console.error("[rovia] Paylaşım kaydedilemedi:", error?.code, error?.message);
    return { ok: false, message: dbMessage(error) };
  }
  const row = data as { visibility: string; token: string | null; options?: unknown; privacyRadiusM?: number };
  // Önbellekteki paylaşım sayfaları (eski ve yeni bağlantı) hemen güncellenir
  for (const r of before) updateTag(shareTag(r.token));
  if (row.token) updateTag(shareTag(row.token));

  const state: ShareState = row.visibility === "private" || !row.token
    ? { visibility: "private", token: null, options: d.options, privacyRadiusM: d.privacyRadiusM }
    : { visibility: row.visibility as ShareState["visibility"], token: row.token, options: normalizeOptions(row.options), privacyRadiusM: row.privacyRadiusM ?? d.privacyRadiusM };
  return result(supabase, state);
}

/** Paylaşılan yolculuğun görünür duraklarını yeni bir plana kopyalar ve planlayıcıya yönlendirir. */
export async function copySharedRoute(token: string): Promise<Fail> {
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, message: E.notFound };
  const user = await getCurrentUser();
  if (!user) redirect(`/giris?next=${encodeURIComponent(`/p/${token}`)}`);
  const supabase = await createClient();
  if (!(await limited(supabase))) return { ok: false, message: E.rateLimited };
  const { data, error } = await supabase.rpc("share_copy", { p_token: token });
  if (error || !data) {
    const m = error?.message ?? "";
    if (/nothing_to_copy/.test(m)) return { ok: false, message: E.nothingToCopy };
    if (/too_many_trips/.test(m)) return { ok: false, message: E.tooManyTrips };
    return { ok: false, message: dbMessage(error) };
  }
  redirect(`/planla/${data}`);
}
