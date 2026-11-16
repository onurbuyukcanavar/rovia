import { NextResponse } from "next/server";
import { z } from "zod";
import { photoUri } from "@/lib/google/places";
import { mapsHandler } from "@/lib/api/maps-handler";

/**
 * <img src="/api/maps/photo?name=...&w=..."> için: Google'ın geçici, anahtarsız görsel
 * adresine yönlendirir. Sunucu anahtarı tarayıcıya hiç ulaşmaz.
 */
const schema = z.object({ name: z.string().min(10).max(600), w: z.coerce.number().int().min(100).max(1600).default(800) });

export const GET = mapsHandler(
  { bucket: "photo" },
  schema,
  ({ name, w }) => photoUri(name, w),
  {
    source: "query",
    respond: (uri) => {
      const res = NextResponse.redirect(uri, 302);
      res.headers.set("Cache-Control", "private, max-age=3600");
      return res;
    },
  },
);
