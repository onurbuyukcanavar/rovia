import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Favorite, FavoriteCategory, FavoriteStopItem, ListType, PlaceSource } from "@/lib/favorites/types";

/** Kullanıcının tüm kaydedilmiş yerleri (en yeni önce; en fazla 3000). */
export async function listFavorites(): Promise<Favorite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_places")
    .select("id, name, category, list_type, latitude, longitude, address, notes, source, source_list_name, osm_ref, created_at")
    .order("created_at", { ascending: false })
    .limit(3000);
  if (error) throw new Error(`FAVORITES_QUERY_FAILED: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category as FavoriteCategory,
    listType: p.list_type as ListType,
    lat: p.latitude,
    lng: p.longitude,
    address: p.address,
    notes: p.notes,
    source: p.source as PlaceSource,
    listName: p.source_list_name,
    osmRef: p.osm_ref,
    createdAt: p.created_at,
  }));
}

/** Harita ve planlayıcı için hafif liste. */
export async function listFavoriteStops(): Promise<FavoriteStopItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_places")
    .select("id, name, latitude, longitude, address, osm_ref, list_type")
    .order("created_at", { ascending: false })
    .limit(3000);
  if (error) throw new Error(`FAVORITES_QUERY_FAILED: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id, name: p.name, lat: p.latitude, lng: p.longitude, address: p.address, osmRef: p.osm_ref, listType: p.list_type as ListType,
  }));
}
