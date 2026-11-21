import { headers } from "next/headers";
import { z } from "zod";
import { mapsHandler } from "@/lib/api/maps-handler";
import { getCurrentWeather, ipLocation, WeatherUpstreamError } from "@/lib/weather/server";

const schema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).strict();

/**
 * Panel karşılamasındaki anlık hava durumu (oturum + hız sınırı).
 * Konum: cihaz konumu (yalnızca izin önceden verildiyse istemci gönderir), yoksa IP'ye göre şehir.
 * Yanıt: { weather: { temp, code, isDay, city } | null } — geçici hatalar kullanıcıya hata olarak yansımaz.
 */
export const POST = mapsHandler("weather", schema, async (input) => {
  let lat = input.lat, lon = input.lng, city: string | null = null;
  if (lat === undefined || lon === undefined) {
    const ip = ipLocation(await headers());
    if (!ip) return { weather: null };
    ({ lat, lon, city } = ip);
  }
  try {
    return { weather: { ...(await getCurrentWeather(Math.round(lat * 10) / 10, Math.round(lon * 10) / 10)), city } };
  } catch (e) {
    if (!(e instanceof WeatherUpstreamError) && (e as Error)?.name !== "WeatherUpstreamError") throw e;
    console.warn("[weather] geçici hata:", (e as Error).message);
    return { weather: null };
  }
}, { maxBodyBytes: 512 });
