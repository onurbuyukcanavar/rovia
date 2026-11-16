import { reverseGeocode } from "@/lib/google/geocoding";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

export const POST = mapsHandler({ bucket: "geocode", perMinute: 30, perDay: 500 }, latLngSchema, (point) => reverseGeocode(point));
