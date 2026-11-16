import { z } from "zod";
import { autocomplete } from "@/lib/geo-services/features";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

const schema = z.object({ text: z.string().trim().min(2).max(120), bias: latLngSchema.optional() });

export const POST = mapsHandler("autocomplete", schema, async (input, db) => ({ suggestions: await autocomplete(db, input) }));
