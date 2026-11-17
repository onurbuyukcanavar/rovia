"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { normalizeForSearch } from "@/lib/places/normalize";
import { coordsFromGoogleUrl, nameFromGoogleUrl } from "@/lib/import/google-url";
import { resolveGoogleMapsLink } from "@/lib/import/resolve-google-link";
import { FAVORITE_CATEGORIES, type SaveResult } from "@/lib/favorites/types";
import { placeInputSchema, type PlaceInput } from "@/lib/favorites/schema";
import { t } from "@/i18n";

type Fail = { ok: false; message: string };

async function limited(bucket: "places") {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_bucket: bucket });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  return { supabase, allowed: data === true };
}

const saveSchema = z.object({
  source: z.enum(["manual", "google_takeout", "google_link", "kml", "gpx", "csv", "explore", "trip"]),
  fileName: z.string().max(255).nullish(),
  items: z.array(placeInputSchema).min(1).max(500),
});

/**
 * Yer kaydetme ve içe aktarmanın tek kapısı (veritabanında save_places: mükerrer kontrolü,
 * OSM'den kategori çıkarımı, içe aktarma kaydı). İçe aktarmada istemci 500'lük parçalar gönderir.
 */
export async function savePlaces(input: { source: string; fileName?: string | null; items: PlaceInput[] }): Promise<({ ok: true } & SaveResult) | Fail> {
  await requireUser();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.favorites.errors.invalid };
  const { supabase, allowed } = await limited("places");
  if (!allowed) return { ok: false, message: t.favorites.errors.rateLimited };

  const items = parsed.data.items.map((p) => ({
    name: p.name, lat: p.lat, lng: p.lng, address: p.address ?? null, notes: p.notes ?? null,
    category: p.category ?? null, list_type: p.listType ?? "favorite", osm_ref: p.osmRef ?? null,
    source_ref: p.sourceRef ?? null, list_name: p.listName ?? null,
  }));
  const { data, error } = await supabase.rpc("save_places", {
    p_source: parsed.data.source, p_file_name: parsed.data.fileName ?? null, p_items: items,
  } as never);
  if (error || !data) {
    console.error("[rovia] Yerler kaydedilemedi:", error?.code, error?.message);
    return { ok: false, message: t.common.unexpectedError };
  }
  revalidatePath("/favoriler");
  revalidatePath("/panel");
  return { ok: true, ...(data as unknown as SaveResult) };
}

const updateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  category: z.enum(FAVORITE_CATEGORIES),
  listType: z.enum(["favorite", "want_to_go"]),
  notes: z.string().trim().max(5000).nullable(),
});

export async function updateFavorite(input: z.input<typeof updateSchema>): Promise<{ ok: true } | Fail> {
  await requireUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.favorites.errors.invalid };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_places")
    .update({ name: parsed.data.name, category: parsed.data.category, list_type: parsed.data.listType, notes: parsed.data.notes || null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    console.error("[rovia] Favori güncellenemedi:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  if (!data?.length) return { ok: false, message: t.favorites.errors.notFound };
  revalidatePath("/favoriler");
  return { ok: true };
}

export async function deleteFavorites(ids: string[]): Promise<{ ok: true; deleted: number } | Fail> {
  await requireUser();
  const parsed = z.array(z.uuid()).min(1).max(1000).safeParse(ids);
  if (!parsed.success) return { ok: false, message: t.favorites.errors.invalid };
  const supabase = await createClient();
  const { data, error } = await supabase.from("saved_places").delete().in("id", parsed.data).select("id");
  if (error) {
    console.error("[rovia] Favori silinemedi:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  revalidatePath("/favoriler");
  revalidatePath("/panel");
  return { ok: true, deleted: data?.length ?? 0 };
}

export type NameMatch = { i: number; osmRef: string; name: string; admin: string | null; lat: number; lng: number; category: string };

/** Koordinatsız içe aktarma kayıtları için ada göre konum önerisi (ROVIA OSM verisi; yalnızca güçlü eşleşmeler). */
export async function matchPlaceNames(names: string[]): Promise<{ ok: true; matches: NameMatch[] } | Fail> {
  await requireUser();
  const parsed = z.array(z.string().max(300)).min(1).max(200).safeParse(names);
  if (!parsed.success) return { ok: false, message: t.favorites.errors.invalid };
  const { supabase, allowed } = await limited("places");
  if (!allowed) return { ok: false, message: t.favorites.errors.rateLimited };
  const { data, error } = await supabase.rpc("match_place_names", { p_queries: parsed.data.map((n) => normalizeForSearch(n).slice(0, 120)) });
  if (error) {
    console.error("[rovia] Ad eşleştirme başarısız:", error.code);
    return { ok: false, message: t.common.unexpectedError };
  }
  return {
    ok: true,
    // SQL sırası 1'den başlar; istemci dizisi 0'dan
    matches: (data ?? []).map((m) => ({
      i: m.i! - 1, osmRef: m.osm_ref!, name: m.name!, admin: m.admin, lat: m.lat!, lng: m.lng!, category: m.category!,
    })),
  };
}

export type LinkPreview = { name: string; lat: number; lng: number; url: string; estimated: boolean; admin: string | null };

/** Google Maps paylaşım bağlantısından yer: önce bağlantıdaki koordinat, yoksa ada göre eşleştirme. */
export async function previewGoogleLink(link: string): Promise<({ ok: true } & LinkPreview) | Fail> {
  await requireUser();
  if (typeof link !== "string" || link.length > 2048) return { ok: false, message: t.favorites.link.invalid };
  const { supabase, allowed } = await limited("places");
  if (!allowed) return { ok: false, message: t.favorites.errors.rateLimited };

  let url: string;
  try {
    url = await resolveGoogleMapsLink(link);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    return { ok: false, message: code === "invalid_link" ? t.favorites.link.invalid : t.favorites.link.unresolved };
  }
  const name = nameFromGoogleUrl(url);
  const coords = coordsFromGoogleUrl(url);
  if (coords) return { ok: true, name: name ?? t.favorites.link.unnamed, ...coords, url, estimated: false, admin: null };
  if (!name) return { ok: false, message: t.favorites.link.unresolved };

  const { data } = await supabase.rpc("match_place_names", { p_queries: [normalizeForSearch(name).slice(0, 120)] });
  const m = data?.[0];
  if (!m) return { ok: false, message: t.favorites.link.noCoords(name) };
  return { ok: true, name, lat: m.lat!, lng: m.lng!, url, estimated: true, admin: m.admin };
}
