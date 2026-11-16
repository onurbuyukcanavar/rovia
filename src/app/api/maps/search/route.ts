import { z } from "zod";
import { ROUTE_CATEGORY_KEYS } from "@/lib/places/categories";
import { searchAlongRoute, searchNearby } from "@/lib/geo-services/features";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("route"),
    category: z.enum(ROUTE_CATEGORY_KEYS),
    encodedPolyline: z.string().min(4).max(400_000),
    radiusMeters: z.number().int().min(250).max(50_000),
  }),
  z.object({
    mode: z.literal("nearby"),
    category: z.enum(ROUTE_CATEGORY_KEYS),
    center: latLngSchema,
    radiusMeters: z.number().int().min(250).max(50_000),
  }),
]);

export const POST = mapsHandler("search", schema, async (input, db) => ({
  places: input.mode === "route" ? await searchAlongRoute(db, input) : await searchNearby(db, input),
}));
