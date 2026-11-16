import { reverseGeocode } from "@/lib/google/geocoding";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

export const POST = mapsHandler({ bucket: "geocode" }, latLngSchema, (point) => reverseGeocode(point));
