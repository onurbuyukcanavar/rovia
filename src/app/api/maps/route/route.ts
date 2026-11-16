import { z } from "zod";
import { computeRoutes, MAX_INTERMEDIATES } from "@/lib/google/routes";
import { mapsHandler, waypointSchema } from "@/lib/api/maps-handler";

const schema = z.object({
  origin: waypointSchema,
  destination: waypointSchema,
  intermediates: z.array(waypointSchema).max(MAX_INTERMEDIATES).default([]),
  alternatives: z.boolean().default(true),
  trafficAware: z.boolean().default(false),
});

export const POST = mapsHandler({ bucket: "route" }, schema, (input) => computeRoutes(input));
