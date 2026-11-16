import "server-only";
import { GeoError } from "./errors";

/**
 * Herkese açık OSM servislerinin kullanım politikaları uygulamanın kendini tanıtmasını ister.
 * https://operations.osmfoundation.org/policies/
 */
export const USER_AGENT = "ROVIA/0.2 (+https://github.com/onurbuyukcanavar/rovia)";

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; body: T }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(init.timeoutMs ?? 12_000),
      cache: "no-store",
    });
  } catch (e) {
    const name = (e as Error)?.name;
    throw new GeoError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "upstream", String(e));
  }
  if (res.status === 429) throw new GeoError("busy", `${url.split("?")[0]} 429`);
  const text = await res.text();
  try {
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
  } catch {
    throw new GeoError("upstream", `non-json ${res.status} from ${url.split("?")[0]}`);
  }
}
