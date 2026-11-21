import "server-only";
import { isShortLink, parseLocationUrl, type ParsedLocation } from "./parse";

/** En fazla yönlendirme adımı ve adım başı zaman aşımı. */
export const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 4_000;

export class ResolveError extends Error {
  constructor(readonly code: "invalid_link" | "unresolvable" | "timeout") {
    super(code);
    this.name = "ResolveError";
  }
}

const GOOGLE = /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/;
const YANDEX = /^(?:www\.|maps\.)?yandex\.(?:ru|com|com\.tr|tr|by|kz|ua|uz)$/;

/**
 * Yönlendirme zincirinde istek atılabilecek adresler (SSRF koruması). Yalnızca bilinen harita
 * kısaltıcıları ve hedefleri; https, standart port, kullanıcı bilgisi yok, IP adresi yok.
 * Alan adları sabit olduğundan özel ağ adreslerine (169.254.x, 10.x, localhost) istek atılamaz.
 */
export function isAllowedHop(u: URL): boolean {
  if (u.protocol !== "https:") return false;
  if (u.port !== "" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  // IPv4 / IPv6 sabitleri hiçbir zaman izinli değildir
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  if (isShortLink(u)) return true;
  if (GOOGLE.test(h)) return u.pathname.startsWith("/maps") || u.pathname === "/search" || u.pathname === "/" || u.pathname.startsWith("/url");
  if (h === "maps.apple.com") return true;
  if (YANDEX.test(h)) return u.pathname.startsWith("/maps") || u.pathname.startsWith("/-/");
  return false;
}

/** Google'ın AB çerez onay sayfası ve /url?q= aracı: hedef adres parametreden alınır, sayfaya istek atılmaz. */
function unwrap(u: URL): URL | null {
  const h = u.hostname.toLowerCase();
  if (h === "consent.google.com" || h === "consent.youtube.com") {
    const cont = u.searchParams.get("continue");
    return cont ? safeUrl(cont) : null;
  }
  if (GOOGLE.test(h) && u.pathname === "/url") {
    const q = u.searchParams.get("q") ?? u.searchParams.get("url");
    return q ? safeUrl(q) : null;
  }
  return u;
}

function safeUrl(s: string, base?: URL): URL | null {
  try {
    const u = new URL(s, base);
    if (u.protocol === "http:" && (isShortLink(u) || GOOGLE.test(u.hostname) || YANDEX.test(u.hostname))) u.protocol = "https:";
    return u;
  } catch {
    return null;
  }
}

/**
 * Kısa bağlantıyı (maps.app.goo.gl, goo.gl/maps, g.co/kgs, share.google, maps.apple/p, yandex /maps/-/)
 * yönlendirmeleri ELLE izleyerek çözer ve son adresi ayrıştırır. Sayfa içeriği okunmaz.
 */
export async function resolveShortLink(input: string, fetchImpl: typeof fetch = fetch): Promise<Exclude<ParsedLocation, { kind: "resolve" }>> {
  let current = safeUrl(input.trim());
  if (!current || !isAllowedHop(current)) throw new ResolveError("invalid_link");

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const parsed = parseLocationUrl(current.href);
    if (parsed && parsed.kind !== "resolve") return parsed;
    if (hop === MAX_HOPS) break;

    let res: Response;
    try {
      res = await fetchImpl(current.href, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ROVIA/0.6; +https://www.roviaroad.com)",
          "accept-language": "tr-TR,tr;q=0.9",
        },
        cache: "no-store",
      });
    } catch (e) {
      const name = (e as Error)?.name;
      throw new ResolveError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unresolvable");
    }
    void res.body?.cancel().catch(() => undefined);
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status >= 400) break;

    const next = safeUrl(location, current);
    const target = next && unwrap(next);
    if (!target || !isAllowedHop(target)) throw new ResolveError("invalid_link");
    current = target;
  }
  throw new ResolveError("unresolvable");
}
