/**
 * Google Maps bağlantılarından koordinat ve yer adı çıkarma (ağ isteği yapmadan).
 * Takeout liste CSV'leri ve paylaşım bağlantıları farklı biçimlerde olabilir:
 *   …/maps/place/Ad/@41.0,28.9,17z/data=…!3d41.0123!4d28.9876…   (!3d/!4d: yerin kendi koordinatı)
 *   …/maps?q=41.0,28.9 · …/maps/search/41.0,+28.9 · …?ll=… · …/maps/@41.0,28.9,15z
 *   …/maps/place/Ad/data=!4m2!3m1!1s0x…:0x…   (koordinat yok → ada göre eşleştirilir)
 */
export type LatLngOrNull = { lat: number; lng: number } | null;

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

function valid(lat: number, lng: number): LatLngOrNull {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s.replace(/\+/g, " ");
  }
}

export function coordsFromGoogleUrl(url: string | null | undefined): LatLngOrNull {
  if (!url) return null;
  const u = safeDecode(url);
  // En kesin: yerin işaretçisi (!3d enlem !4d boylam)
  let m = u.match(new RegExp(`!3d${NUM}!4d${NUM}`));
  if (m) return valid(Number(m[1]), Number(m[2]));
  // Sorgu parametreleri
  m = u.match(new RegExp(`[?&](?:q|query|ll|sll|center|destination|daddr)=${NUM},\\s*${NUM}`));
  if (m) return valid(Number(m[1]), Number(m[2]));
  // /search/41.0, 28.9 · /place/41.0,28.9 · /dir/…/41.0,28.9
  m = u.match(new RegExp(`/(?:search|place|dir)/(?:[^/]*/)*?${NUM},\\s*${NUM}(?:[/?@]|$)`));
  if (m) return valid(Number(m[1]), Number(m[2]));
  // Harita görünümü merkezi: @41.0,28.9,15z (yer işaretçisi yoksa en iyi tahmin)
  m = u.match(new RegExp(`@${NUM},${NUM}`));
  if (m) return valid(Number(m[1]), Number(m[2]));
  return null;
}

/** /maps/place/Topkap%C4%B1+Saray%C4%B1/… → "Topkapı Sarayı" */
export function nameFromGoogleUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/maps\/place\/([^/@?]+)/);
  if (!m) return null;
  const name = safeDecode(m[1]).trim();
  // Koordinat biçimindeki "ad" ad değildir
  if (!name || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(name)) return null;
  return name.slice(0, 200);
}

/** İzin verilen Google Maps adresleri (kısa bağlantı çözümlemede SSRF koruması). */
export function isGoogleMapsHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (host === "maps.app.goo.gl") return true;
  if (host === "goo.gl" && url.pathname.startsWith("/maps")) return true;
  if (host === "maps.google.com" || /^maps\.google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return true;
  if (/^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host) && url.pathname.startsWith("/maps")) return true;
  return false;
}
