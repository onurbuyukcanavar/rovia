import { z } from "zod";
import { mapsHandler } from "@/lib/api/maps-handler";
import { MAX_INPUT } from "@/lib/shared-location/parse";
import { resolveSharedLocation } from "@/lib/shared-location/service";

const schema = z.object({
  text: z.string().trim().min(2).max(MAX_INPUT),
  label: z.string().trim().max(200).nullish(),
});

/** Paylaşılan konum (WhatsApp mesajı, harita bağlantısı, kısa bağlantı, geo: URI, koordinat) → nokta. */
export const POST = mapsHandler("location", schema, async (input, db) => ({
  location: await resolveSharedLocation(db, input.text, input.label),
}), { maxBodyBytes: 16 * 1024 });
