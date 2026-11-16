import { reverseGeocode } from "@/lib/geo-services/features";
import { latLngSchema, mapsHandler } from "@/lib/api/maps-handler";

export const POST = mapsHandler("geocode", latLngSchema, (point, db) => reverseGeocode(db, point));
