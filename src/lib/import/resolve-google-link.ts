import "server-only";
import { coordsFromGoogleUrl, isGoogleMapsHost } from "./google-url";

const MAX_HOPS = 6;

/**
 * Google Maps paylaşım bağlantısını (maps.app.goo.gl/…) tam adrese çözer.
 * Yalnızca yönlendirme (Location) başlıkları okunur, sayfa içeriği alınmaz ve ayrıştırılmaz.
 * Her adım izinli Google Maps alan adlarıyla sınırlıdır (SSRF koruması). AB bölgesinden gelen
 * isteklerde Google önce çerez onay sayfasına yönlendirir: hedef adres "continue" parametresinden alınır.
 */
export async function resolveGoogleMapsLink(input: string): Promise<string> {
  let current: URL;
  try {
    current = new URL(input.trim());
  } catch {
    throw new Error("invalid_link");
  }
  if (!isGoogleMapsHost(current)) throw new Error("invalid_link");

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (coordsFromGoogleUrl(current.href) || current.pathname.startsWith("/maps/place/")) return current.href;
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; ROVIA/0.5; +https://www.roviaroad.com)", "accept-language": "tr-TR,tr;q=0.9" },
      cache: "no-store",
    });
    void res.body?.cancel().catch(() => undefined);
    const location = res.headers.get("location");
    if (!location || res.status < 300 || res.status >= 400) return current.href;

    let next = new URL(location, current);
    if (next.hostname === "consent.google.com") {
      const cont = next.searchParams.get("continue");
      if (!cont) throw new Error("unresolvable_link");
      next = new URL(cont);
    }
    if (!isGoogleMapsHost(next)) throw new Error("invalid_link");
    current = next;
  }
  return current.href;
}
