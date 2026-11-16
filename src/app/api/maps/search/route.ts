import { z } from "zod";
import { ROUTE_CATEGORY_KEYS } from "@/lib/google/categories";
import { searchAlongRoute, searchNearby } from "@/lib/google/places";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("route"),
    category: z.enum(ROUTE_CATEGORY_KEYS),
    encodedPolyline: z.string().min(4).max(200_000),
    radiusMeters: z.number().int().min(250).max(50_000),
  }),
  z.object({
    mode: z.literal("nearby"),
    category: z.enum(ROUTE_CATEGORY_KEYS),
    center: latLngSchema,
    radiusMeters: z.number().int().min(250).max(50_000),
  }),
]);

export const POST = mapsHandler({ bucket: "search", perMinute: 20, perDay: 300 }, schema, async (input) => ({
  places: input.mode === "route" ? await searchAlongRoute(input) : await searchNearby(input),
}));
