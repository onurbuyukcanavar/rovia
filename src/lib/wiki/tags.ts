/**
 * Vikipedi/Wikidata için saf yardımcılar (istemci + sunucu). zod ya da next/* içe aktarmaz:
 * istemci paketine girer, birim testlenebilir.
 */

/** Vikipedi dil kodu: "tr", "en", "zh-min-nan" gibi; alan adına girdiği için katı. */
export const WIKI_LANG_RE = /^[a-z]{2,3}(-[a-z]+)?$/;
export const WIKIDATA_RE = /^Q\d{1,12}$/;
export const MAX_TITLE = 300;

/** Başlıkta izin verilmeyen karakterler (MediaWiki yasaklı karakterleri + kontrol karakterleri). */
const BAD_TITLE_CHARS = /[\u0000-\u001f\u007f#<>[\]{}|]/;

export type WikiRef = { lang: string; title: string };

/** "tr:Uçhisar Kalesi" → { lang: "tr", title: "Uçhisar Kalesi" } ; geçersizse null. */
export function parseWikipediaTag(raw: string | undefined | null): WikiRef | null {
  const m = raw?.trim().match(/^([^:]{2,12}):(.+)$/);
  if (!m) return null;
  const lang = m[1].trim().toLowerCase();
  const title = m[2].trim().replace(/_/g, " ").replace(/\s+/g, " ");
  if (!WIKI_LANG_RE.test(lang) || !isValidTitle(title)) return null;
  return { lang, title };
}

export function isValidTitle(title: string): boolean {
  return title.length > 0 && title.length <= MAX_TITLE && !BAD_TITLE_CHARS.test(title);
}

export function parseWikidataTag(raw: string | undefined | null): string | null {
  const id = raw?.trim().split(";")[0]?.trim();
  return id && WIKIDATA_RE.test(id) ? id : null;
}

/**
 * Vikipedi/Wikidata etiketi olmayan yerlerde konum + ad eşleştirmesi yalnızca bu tür yerler için denenir
 * (tarihî yapı, müze, ören yeri, kale, anıt...). geo_features.category / subtype ve Keşfet kategorileri.
 */
const ELIGIBLE_CATEGORIES = new Set([
  "historic", "museum", "attraction", "ancient", "castle", "heritage",
]);
const ELIGIBLE_SUBTYPES = new Set([
  "castle", "fort", "ruins", "archaeological_site", "monument", "memorial", "city_gate", "citywalls",
  "aqueduct", "tomb", "caravanserai", "bridge", "museum", "attraction", "gallery",
]);

export function isGeoMatchEligible(category: string | null | undefined, subtype?: string | null): boolean {
  return (!!category && ELIGIBLE_CATEGORIES.has(category)) || (!!subtype && ELIGIBLE_SUBTYPES.has(subtype));
}

/** Sunucuya gönderilecek istek gövdesi. */
export type WikiRequest =
  | { wikipedia?: string; wikidata?: string }
  | { name: string; lat: number; lon: number; category: string; subtype?: string };

/** Yer etiketlerinden istek gövdesi; sorgulanacak bir şey yoksa null (istek atılmaz). */
export function wikiRequestFor(place: {
  name: string;
  tags: Record<string, string>;
  location: { lat: number; lng: number };
  category: string;
  subtype?: string | null;
}): WikiRequest | null {
  const wp = parseWikipediaTag(place.tags.wikipedia);
  const wd = parseWikidataTag(place.tags.wikidata);
  if (wp || wd) {
    return { ...(wp ? { wikipedia: `${wp.lang}:${wp.title}` } : {}), ...(wd ? { wikidata: wd } : {}) };
  }
  const name = place.name.trim();
  if (!name || name.length > MAX_TITLE || !isGeoMatchEligible(place.category, place.subtype)) return null;
  return {
    name,
    lat: Math.round(place.location.lat * 1e5) / 1e5,
    lon: Math.round(place.location.lng * 1e5) / 1e5,
    category: place.category.slice(0, 40),
    ...(place.subtype ? { subtype: place.subtype.slice(0, 60) } : {}),
  };
}

/** İstemci önbelleği anahtarı. */
export const wikiRequestKey = (r: WikiRequest) => JSON.stringify(r);
