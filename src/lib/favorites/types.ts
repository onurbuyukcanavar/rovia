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

/** Doğrulama şeması: ./schema.ts (zod istemci paketine girmesin diye ayrı). */
export type { PlaceInput } from "./schema";

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
