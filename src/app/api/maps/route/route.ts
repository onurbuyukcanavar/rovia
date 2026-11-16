import { z } from "zod";
import { computeRoute, MAX_INTERMEDIATES } from "@/lib/geo-services/valhalla";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

const schema = z.object({
  origin: latLngSchema,
  destination: latLngSchema,
  intermediates: z.array(latLngSchema).max(MAX_INTERMEDIATES).default([]),
  alternatives: z.boolean().default(true),
});

export const POST = mapsHandler("route", schema, ({ origin, destination, intermediates, alternatives }) =>
  computeRoute([origin, ...intermediates, destination], alternatives),
);
