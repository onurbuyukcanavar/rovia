import type { Stop } from "@/lib/maps/types";
import type { FavoriteStopItem } from "./types";

/** Favori → rota durağı (sunucu ve istemcide ortak). */
export const favoriteToStopServer = (f: FavoriteStopItem): Stop => ({
  id: f.osmRef ?? `fav:${f.id}`, label: f.name, address: f.address, ref: f.osmRef, location: { lat: f.lat, lng: f.lng },
});
