import { z } from "zod";
import { FAVORITE_CATEGORIES } from "./types";

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
