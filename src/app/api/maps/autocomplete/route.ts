import { z } from "zod";
import { autocomplete } from "@/lib/google/places";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

const schema = z.object({
  text: z.string().trim().min(2).max(120),
  sessionToken: z.uuid(),
  bias: latLngSchema.optional(),
});

export const POST = mapsHandler({ bucket: "autocomplete", perMinute: 120, perDay: 2_000 }, schema, (input) =>
  autocomplete(input).then((suggestions) => ({ suggestions })),
);
