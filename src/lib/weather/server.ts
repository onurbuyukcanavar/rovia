import "server-only";
import { cacheLife } from "next/cache";

export type CurrentWeather = { temp: number; code: number; isDay: boolean };

export class WeatherUpstreamError extends Error {
  name = "WeatherUpstreamError";
}

/**
 * Anlık hava durumu (Open-Meteo, anahtarsız). Kişiye özel veri içermez: koordinat ~11 km'ye yuvarlanır
 * ve sonuç tüm kullanıcılar için paylaşılan uzak önbellekte 15 dakika tutulur. Hatalar önbelleğe girmez.
 */
export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 900, expire: 3600 });
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(1));
  url.searchParams.set("longitude", lon.toFixed(1));
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set("timezone", "auto");
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } }).catch((e) => {
    throw new WeatherUpstreamError(String(e));
  });
  if (!res.ok) throw new WeatherUpstreamError(`open-meteo ${res.status}`);
  const j = (await res.json()) as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown } };
  const c = j.current;
  if (typeof c?.temperature_2m !== "number" || typeof c.weather_code !== "number") throw new WeatherUpstreamError("bad payload");
  return { temp: Math.round(c.temperature_2m), code: c.weather_code, isDay: c.is_day !== 0 };
}

/** Vercel'in IP tabanlı konum başlıkları (izin gerektirmez, şehir düzeyinde yaklaşık). */
export function ipLocation(h: Headers): { lat: number; lon: number; city: string | null } | null {
  const lat = Number(h.get("x-vercel-ip-latitude")), lon = Number(h.get("x-vercel-ip-longitude"));
  if (!h.get("x-vercel-ip-latitude") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let city: string | null = null;
  try {
    const raw = h.get("x-vercel-ip-city");
    city = raw ? decodeURIComponent(raw).slice(0, 60) : null;
  } catch { city = null; }
  return { lat, lon, city };
}
