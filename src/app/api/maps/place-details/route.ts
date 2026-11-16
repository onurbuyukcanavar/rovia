import { z } from "zod";
import { placeDetails } from "@/lib/google/places";
import { mapsHandler } from "@/lib/api/maps-handler";

const schema = z.object({ placeId: z.string().min(10).max(300) });

export const POST = mapsHandler({ bucket: "details" }, schema, ({ placeId }) => placeDetails(placeId));
