import "server-only";
import { MapsError, fromGoogleError } from "./errors";

export function getServerKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new MapsError("not_configured", "GOOGLE_MAPS_SERVER_KEY missing");
  return key;
}

export const isMapsServerConfigured = () => Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);

type GoogleRequest = {
  method?: "GET" | "POST";
  body?: unknown;
  fieldMask?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

/**
 * Google Maps Platform'a sunucu anahtarıyla istek. Anahtar yalnızca başlıkta gider,
 * URL'ye yazılmaz (loglarda görünmesin diye). Hatalar MapsError'a çevrilir.
 */
export async function googleJson<T>(url: string, req: GoogleRequest = {}): Promise<T> {
  const key = getServerKey();
  const headers: Record<string, string> = { "X-Goog-Api-Key": key, ...req.headers };
  if (req.fieldMask) headers["X-Goog-FieldMask"] = req.fieldMask;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method ?? (req.body !== undefined ? "POST" : "GET"),
      headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(req.timeoutMs ?? 10_000),
      cache: "no-store",
    });
  } catch (e) {
    const name = (e as Error)?.name;
    throw new MapsError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "upstream", String(e));
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new MapsError("upstream", `non-json ${res.status}`);
  }
  if (!res.ok) throw fromGoogleError(res.status, json);
  return json as T;
}

/** "1234s" / "1234.5s" biçimindeki Google Duration değerini saniyeye çevirir. */
export function parseDuration(value: string | undefined | null): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(/s$/, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
