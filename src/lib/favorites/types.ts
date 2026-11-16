import { z } from "zod";

export const FAVORITE_CATEGORIES = ["restaurant", "cafe", "attraction", "historic", "nature", "hotel", "camping", "fuel", "other"] as const;
export type FavoriteCategory = (typeof FAVORITE_CATEGORIES)[number];
export type ListType = "favorite" | "want_to_go";
export type PlaceSource = "manual" | "google_takeout" | "google_link" | "kml" | "gpx" | "csv" | "explore" | "trip";

/** Google'dan gelenler ile kullanıcının ROVIA'da oluşturdukları ayrı gösterilir (brief §4.3, §7). */
export const isGoogleSource = (s: string) => s === "google_takeout" || s === "google_link";

export type Favorite = {
  id: string;
  name: string;
  category: FavoriteCategory;
  listType: ListType;
  lat: number;
  lng: number;
  address: string | null;
  notes: string | null;
  source: PlaceSource;
  listName: string | null;
  osmRef: string | null;
  createdAt: string;
};

/** save_places'e giden tek kayıt (istemci → sunucu). */
export const placeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  category: z.enum(FAVORITE_CATEGORIES).nullish(),
  listType: z.enum(["favorite", "want_to_go"]).nullish(),
  osmRef: z.string().regex(/^[nwr][0-9]{1,19}$/).nullish(),
  sourceRef: z.string().max(1024).nullish(),
  listName: z.string().trim().max(200).nullish(),
});
export type PlaceInput = z.input<typeof placeInputSchema>;

export type SaveResult = {
  imported: number;
  duplicates: number;
  invalid: number;
  results: { i: number; status: "imported" | "duplicate" | "invalid"; id?: string }[];
};

/** Harita ve planlayıcıya giden hafif favori kaydı */
export type FavoriteStopItem = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  osmRef: string | null;
  listType: ListType;
};
