import "server-only";
import { createHash } from "node:crypto";
import { cacheLife } from "next/cache";
import { t } from "@/i18n";
import { pickGeoMatch } from "./match";
import {
  buildFacts, commonsImage, entityIds, parseEntity, parseGeosearch, parseLabels, parseSummary, pickSitelink, stringValue,
  type Entity, type Summary, type WikiInfo,
} from "./parse";
import { isGeoMatchEligible, isValidTitle, WIKI_LANG_RE, WIKIDATA_RE } from "./tags";

/**
 * Vikipedi / Wikidata istemcisi. Yalnızca https://{lang}.wikipedia.org ve https://www.wikidata.org adreslerine
 * gidilir; dil kodu ve başlık doğrulanmış girdiden gelir, alan adı kullanıcıdan alınmaz.
 * Wikimedia User-Agent kuralı: uygulama adı + iletişim bilgisi (WIKIMEDIA_CONTACT ile e-posta eklenebilir).
 */
const CONTACT = process.env.WIKIMEDIA_CONTACT?.trim();
const USER_AGENT = `ROVIA/1.0 (https://www.roviaroad.com${CONTACT && /^[^\s()<>;]{3,120}$/.test(CONTACT) ? `; ${CONTACT}` : ""})`;
const TIMEOUT_MS = 5000;
const MAX_BYTES = 1024 * 1024;

/** Geçici hata (zaman aşımı, 5xx, 429): önbelleğe alınmaz, istek sonra yeniden denenebilir. */
export class WikiUpstreamError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "WikiUpstreamError";
  }
}

async function getJson(url: URL): Promise<unknown | null> {
  if (url.protocol !== "https:" || !(url.hostname === "www.wikidata.org" || /^[a-z]{2,3}(-[a-z]+)?\.wikipedia\.org$/.test(url.hostname))) {
    throw new Error(`wiki: izin verilmeyen adres ${url.hostname}`);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new WikiUpstreamError(`${url.hostname}: ${(e as Error).name}`);
  }
  // Yönlendirme yalnızca aynı türden Wikimedia adresine olabilir (REST özeti madde adı yönlendirmesi)
  const final = new URL(res.url || url.href);
  if (final.hostname !== url.hostname) return null;
  if (res.status === 404 || res.status === 400) return null;
  if (res.status === 429 || res.status >= 500) throw new WikiUpstreamError(`${url.hostname}: HTTP ${res.status}`);
  if (!res.ok) return null;
  const text = await res.text();
  if (text.length > MAX_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function apiUrl(host: string, params: Record<string, string>): URL {
  const u = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ ...params, format: "json", formatversion: "2", origin: "*" })) u.searchParams.set(k, v);
  return u;
}

async function fetchSummary(lang: string, title: string): Promise<Summary | null> {
  if (!WIKI_LANG_RE.test(lang) || !isValidTitle(title)) return null;
  const url = new URL(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  url.searchParams.set("redirect", "true");
  return parseSummary(await getJson(url), lang);
}

async function fetchEntity(id: string): Promise<Entity | null> {
  if (!WIKIDATA_RE.test(id)) return null;
  const json = await getJson(apiUrl("www.wikidata.org", {
    action: "wbgetentities", ids: id, props: "sitelinks|claims", sitefilter: "trwiki|enwiki",
  }));
  return parseEntity(json, id);
}

async function fetchLabels(ids: string[]): Promise<Record<string, string>> {
  const valid = ids.filter((id) => WIKIDATA_RE.test(id)).slice(0, 20);
  if (!valid.length) return {};
  return parseLabels(await getJson(apiUrl("www.wikidata.org", {
    action: "wbgetentities", ids: valid.join("|"), props: "labels", languages: "tr|en", languagefallback: "0",
  })));
}

async function geosearch(lang: "tr" | "en", lat: number, lon: number) {
  return parseGeosearch(await getJson(apiUrl(`${lang}.wikipedia.org`, {
    action: "query", list: "geosearch", gscoord: `${lat}|${lon}`, gsradius: "500", gslimit: "20", gsnamespace: "0",
  })));
}

async function withFacts(summary: Summary, entity: Entity | null, source: WikiInfo["source"]): Promise<WikiInfo> {
  const ent = entity ?? (summary.wikibaseItem ? await fetchEntity(summary.wikibaseItem).catch(() => null) : null);
  let facts: WikiInfo["facts"] = [];
  let thumbnail = summary.thumbnail;
  let imageDescriptionUrl = summary.imageDescriptionUrl;
  if (ent) {
    const labels = await fetchLabels([...entityIds(ent, "P31"), ...entityIds(ent, "P1435")]).catch(() => ({}));
    facts = buildFacts(ent, labels, t.explore.wiki.facts);
    if (!thumbnail) {
      const file = stringValue(ent, "P18");
      const img = file ? commonsImage(file, createHash("md5").update(file.trim().replace(/ /g, "_")).digest("hex")) : null;
      // Gerçek boyut bilinmez; kart sabit en-boy oranıyla kırpar
      if (img) {
        thumbnail = { src: img.src, width: 640, height: 427 };
        imageDescriptionUrl = img.descriptionUrl;
      }
    }
  }
  return {
    title: summary.title,
    ...(summary.description ? { description: summary.description } : {}),
    extract: summary.extract,
    url: summary.url,
    lang: summary.lang,
    ...(thumbnail ? { thumbnail } : {}),
    ...(imageDescriptionUrl ? { imageDescriptionUrl } : {}),
    facts,
    source,
  };
}

export type WikiLookup =
  | { kind: "ref"; wikipedia: { lang: string; title: string } | null; wikidata: string | null }
  | { kind: "geo"; name: string; lat: number; lon: number; category: string; subtype: string | null };

async function resolveRef(wikipedia: { lang: string; title: string } | null, wikidata: string | null): Promise<WikiInfo | null> {
  // Türkçe etiket varsa doğrudan
  if (wikipedia?.lang === "tr") {
    const s = await fetchSummary("tr", wikipedia.title);
    if (s) return withFacts(s, wikidata ? await fetchEntity(wikidata).catch(() => null) : null, "tag");
  }
  let qid = wikidata;
  let tagSummary: Summary | null = null;
  if (!qid && wikipedia) {
    tagSummary = await fetchSummary(wikipedia.lang, wikipedia.title);
    qid = tagSummary?.wikibaseItem ?? null;
  }
  const entity = qid ? await fetchEntity(qid) : null;
  const link = entity ? pickSitelink(entity) : null;
  if (link) {
    const s = tagSummary && tagSummary.lang === link.lang ? tagSummary : await fetchSummary(link.lang, link.title);
    if (s) return withFacts(s, entity, "tag");
  }
  // Türkçe/İngilizce madde yoksa etiketteki dil (ör. yalnızca Almanca madde)
  if (!tagSummary && wikipedia && wikipedia.lang !== "tr") tagSummary = await fetchSummary(wikipedia.lang, wikipedia.title);
  return tagSummary ? withFacts(tagSummary, entity, "tag") : null;
}

async function resolveGeo(name: string, lat: number, lon: number): Promise<WikiInfo | null> {
  for (const lang of ["tr", "en"] as const) {
    const match = pickGeoMatch(name, await geosearch(lang, lat, lon));
    if (!match) continue;
    const s = await fetchSummary(lang, match.title);
    if (s) return withFacts(s, null, "geosearch");
  }
  return null;
}

/**
 * Bir yerin Vikipedi bilgisi. Kişiye özel veri içermez; tüm kullanıcılar için paylaşılan uzak önbellekte
 * (Vercel'de çalışma zamanı önbelleği, yerelde bellek) bulunan sonuç 7 gün, "madde yok" sonucu 1 gün tutulur.
 * Geçici hatalar fırlatılır ve önbelleğe girmez.
 */
export async function getWikiInfo(lookup: WikiLookup): Promise<WikiInfo | null> {
  "use cache: remote";
  const info = lookup.kind === "ref"
    ? await resolveRef(lookup.wikipedia, lookup.wikidata)
    : isGeoMatchEligible(lookup.category, lookup.subtype) ? await resolveGeo(lookup.name, lookup.lat, lookup.lon) : null;
  if (info) cacheLife({ stale: 3600, revalidate: 7 * 86400, expire: 14 * 86400 });
  else cacheLife({ stale: 3600, revalidate: 86400, expire: 2 * 86400 });
  return info;
}
