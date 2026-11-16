import { z } from "zod";
import { placeBasic } from "@/lib/google/places";
import { mapsHandler } from "@/lib/api/maps-handler";

/** Otomatik tamamlama seçiminden sonra yerin konumu (oturum token'ı ile). */
const schema = z.object({ placeId: z.string().min(10).max(300), sessionToken: z.uuid().optional() });

export const POST = mapsHandler({ bucket: "place" }, schema, ({ placeId, sessionToken }) =>
  placeBasic(placeId, sessionToken),
);
