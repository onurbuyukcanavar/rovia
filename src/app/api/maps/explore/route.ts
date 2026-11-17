import { z } from "zod";
import { mapsHandler } from "@/lib/api/maps-handler";
import { EXPLORE_CATEGORY_KEYS } from "@/lib/explore/categories";
import { exploreFeatures } from "@/lib/explore/server";

const lng = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

const schema = z.object({
  category: z.enum(EXPLORE_CATEGORY_KEYS),
  bbox: z.tuple([lng, lat, lng, lat]).refine((b) => b[0] < b[2] && b[1] < b[3], "invalid bbox").optional(),
  encodedPolyline: z.string().min(4).max(400_000).optional(),
  radiusMeters: z.number().int().min(200).max(30_000).optional(),
  limit: z.number().int().min(1).max(300).optional(),
}).refine((v) => !!v.bbox !== !!v.encodedPolyline, "bbox xor encodedPolyline");

export const POST = mapsHandler("search", schema, (input, db) => exploreFeatures(db, input));
