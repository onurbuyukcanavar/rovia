/**
 * Vikipedi REST özeti ve Wikidata varlık yanıtlarının ayrıştırılması. Saf modül: ağ yok, fikstürle testlenir.
 * Dış yanıtlar güvenilmeyen veridir: yalnızca beklenen alanlar, beklenen türde ve izinli alan adlarıyla alınır.
 * HTML hiçbir zaman alınmaz (extract_html kullanılmaz); metin düz metin olarak çizilir.
 */
import { WIKI_LANG_RE } from "./tags";

export type WikiFact = { key: "type" | "inception" | "heritage" | "website"; label: string; value: string; href?: string };

export type WikiInfo = {
  title: string;
  /** Kısa tanım ("Nevşehir'de bir kale") — varsa */
  description?: string;
  /** Düz metin özet */
  extract: string;
  /** Madde bağlantısı (https://{lang}.wikipedia.org/wiki/...) */
  url: string;
  lang: string;
  thumbnail?: { src: string; width: number; height: number };
  /** Görselin dosya sayfası (lisans ve yazar bilgisi orada) */
  imageDescriptionUrl?: string;
  facts: WikiFact[];
  /** Madde nasıl bulundu: OSM wikipedia/wikidata etiketi ya da konum + ad eşleşmesi */
  source: "tag" | "geosearch";
};

export type Summary = {
  title: string;
  description?: string;
  extract: string;
  url: string;
  lang: string;
  wikibaseItem?: string;
  thumbnail?: { src: string; width: number; height: number };
  imageDescriptionUrl?: string;
};

export const MAX_EXTRACT = 1200;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Yalnızca https://upload.wikimedia.org görselleri (CSP img-src ile aynı). */
export function safeUploadUrl(raw: unknown): string | undefined {
  const s = str(raw);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname === "upload.wikimedia.org" && !u.username && !u.port ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Yalnızca https://{lang}.wikipedia.org/wiki/... madde bağlantıları. */
function safeArticleUrl(raw: unknown, lang: string): string | undefined {
  const s = str(raw);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname === `${lang}.wikipedia.org` && u.pathname.startsWith("/wiki/") ? u.href : undefined;
  } catch {
    return undefined;
  }
}

export function articleUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Metni cümle sınırında kısaltır. */
export function clampText(text: string, max = MAX_EXTRACT): string {
  const clean = text.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(".\n"));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : `${cut.replace(/\s+\S*$/, "")}…`).trim();
}

/**
 * Görsel URL'sinden dosya sayfası: .../wikipedia/commons/thumb/a/ab/Dosya.jpg/320px-Dosya.jpg →
 * https://commons.wikimedia.org/wiki/File:Dosya.jpg ; yerel dosyalar ({lang}) için o Vikipedi.
 */
export function imageDescriptionUrl(src: string): string | undefined {
  let path: string;
  try {
    path = new URL(src).pathname;
  } catch {
    return undefined;
  }
  const m = path.match(/^\/wikipedia\/([a-z-]+)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  if (!m) return undefined;
  let file: string;
  try {
    file = decodeURIComponent(m[2]);
  } catch {
    return undefined;
  }
  const wiki = m[1];
  const host = wiki === "commons" ? "commons.wikimedia.org" : WIKI_LANG_RE.test(wiki) ? `${wiki}.wikipedia.org` : null;
  return host ? `https://${host}/wiki/${encodeURIComponent(`File:${file}`.replace(/ /g, "_")).replace(/%3A/, ":")}` : undefined;
}

/** REST /page/summary yanıtı. Anlam ayrımı sayfaları ve boş özetler reddedilir. */
export function parseSummary(json: unknown, lang: string): Summary | null {
  if (!isObj(json)) return null;
  if (json.type !== "standard") return null;
  const titles = isObj(json.titles) ? json.titles : {};
  const title = str(titles.normalized) ?? str(json.title)?.replace(/_/g, " ");
  const extract = str(json.extract);
  if (!title || !extract) return null;
  const urls = isObj(json.content_urls) && isObj(json.content_urls.desktop) ? json.content_urls.desktop : {};
  const url = safeArticleUrl(urls.page, lang) ?? articleUrl(lang, title);

  const thumb = isObj(json.thumbnail) ? json.thumbnail : null;
  const src = thumb ? safeUploadUrl(thumb.source) : undefined;
  const width = thumb && typeof thumb.width === "number" ? thumb.width : 0;
  const height = thumb && typeof thumb.height === "number" ? thumb.height : 0;
  const wikibase = str(json.wikibase_item);
  const description = str(json.description);

  return {
    title: title.slice(0, 300),
    ...(description ? { description: description.slice(0, 200) } : {}),
    extract: clampText(extract),
    url,
    lang,
    ...(wikibase && /^Q\d{1,12}$/.test(wikibase) ? { wikibaseItem: wikibase } : {}),
    ...(src && width > 0 && height > 0 ? { thumbnail: { src, width, height }, imageDescriptionUrl: imageDescriptionUrl(src) } : {}),
  };
}

// ---------------------------------------------------------------------------- Wikidata

export type Entity = {
  id: string;
  sitelinks: Record<string, string>;
  claims: Record<string, unknown[]>;
};

/** wbgetentities yanıtından tek varlık (yönlendirmeler dahil: anahtar farklı olabilir). */
export function parseEntity(json: unknown, id: string): Entity | null {
  if (!isObj(json) || !isObj(json.entities)) return null;
  const raw = json.entities[id] ?? Object.values(json.entities)[0];
  if (!isObj(raw) || "missing" in raw) return null;
  const sitelinks: Record<string, string> = {};
  if (isObj(raw.sitelinks)) {
    for (const [site, link] of Object.entries(raw.sitelinks)) {
      const title = isObj(link) ? str(link.title) : undefined;
      if (title) sitelinks[site] = title;
    }
  }
  const claims: Record<string, unknown[]> = {};
  if (isObj(raw.claims)) for (const [p, list] of Object.entries(raw.claims)) if (Array.isArray(list)) claims[p] = list;
  return { id: str(raw.id) ?? id, sitelinks, claims };
}

/** Tercih sırası: Türkçe, İngilizce. */
export function pickSitelink(entity: Entity): { lang: string; title: string } | null {
  for (const lang of ["tr", "en"]) {
    const title = entity.sitelinks[`${lang}wiki`];
    if (title) return { lang, title };
  }
  return null;
}

/** Bir özelliğin değerleri: kullanımdan kalkmış sıradakiler atlanır, "preferred" varsa yalnızca onlar. */
function claimValues(entity: Entity, prop: string): unknown[] {
  const list = (entity.claims[prop] ?? []).filter(
    (c): c is Record<string, unknown> => isObj(c) && c.rank !== "deprecated" && isObj(c.mainsnak) && c.mainsnak.snaktype === "value",
  );
  const preferred = list.filter((c) => c.rank === "preferred");
  return (preferred.length ? preferred : list).map((c) => {
    const snak = c.mainsnak as Record<string, unknown>;
    return isObj(snak.datavalue) ? snak.datavalue.value : undefined;
  }).filter((v) => v !== undefined);
}

export function entityIds(entity: Entity, prop: string, max = 3): string[] {
  const ids = claimValues(entity, prop)
    .map((v) => (isObj(v) ? str(v.id) : undefined))
    .filter((v): v is string => !!v && /^Q\d{1,12}$/.test(v));
  return [...new Set(ids)].slice(0, max);
}

export function stringValue(entity: Entity, prop: string): string | undefined {
  return claimValues(entity, prop).map(str).find(Boolean);
}

/** Wikidata zaman değeri → Türkçe ("1205", "MÖ 4. yüzyıl", "12. yüzyıl", "1890'lar"). */
export function formatWikidataTime(value: unknown): string | undefined {
  if (!isObj(value)) return undefined;
  const time = str(value.time);
  const precision = typeof value.precision === "number" ? value.precision : NaN;
  const m = time?.match(/^([+-])(\d{1,16})-/);
  if (!m || !Number.isFinite(precision)) return undefined;
  const bce = m[1] === "-";
  const year = Number(m[2]);
  if (!Number.isSafeInteger(year) || year === 0 && !bce) return undefined;
  const era = (s: string) => (bce ? `MÖ ${s}` : s);
  if (precision >= 9) return era(String(year));
  if (precision === 8) return era(`${Math.floor(year / 10) * 10}'lar`);
  if (precision === 7) return era(`${Math.floor((year - 1) / 100) + 1}. yüzyıl`);
  if (precision === 6) return era(`${Math.floor((year - 1) / 1000) + 1}. binyıl`);
  return undefined;
}

export function timeValue(entity: Entity, prop: string): string | undefined {
  return claimValues(entity, prop).map(formatWikidataTime).find(Boolean);
}

/** Yalnızca https web sitesi (Wikidata da kullanıcı girdisidir). */
export function safeHttpsUrl(raw: unknown): URL | null {
  const s = str(raw);
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password ? u : null;
  } catch {
    return null;
  }
}

/** wbgetentities props=labels yanıtı → { Q123: "kale" } (Türkçe, yoksa İngilizce). */
export function parseLabels(json: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObj(json) || !isObj(json.entities)) return out;
  for (const [id, ent] of Object.entries(json.entities)) {
    if (!isObj(ent) || !isObj(ent.labels)) continue;
    const labels = ent.labels;
    const pick = (l: string) => (isObj(labels[l]) ? str(labels[l].value) : undefined);
    const label = pick("tr") ?? pick("en");
    if (label) out[id] = label.slice(0, 120);
  }
  return out;
}

/** Commons dosya adı (P18) → upload.wikimedia.org küçük resmi ve dosya sayfası. md5 çağırana verilir (saf modül). */
export function commonsImage(fileName: string, md5hex: string, width = 640): { src: string; descriptionUrl: string } | null {
  const name = fileName.trim().replace(/ /g, "_");
  if (!name || name.length > 240 || /[/\\#?]/.test(name) || !/^[0-9a-f]{32}$/.test(md5hex)) return null;
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext || !["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return null;
  const enc = encodeURIComponent(name);
  const thumbName = ext === "svg" ? `${width}px-${enc}.png` : `${width}px-${enc}`;
  return {
    src: `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5hex[0]}/${md5hex.slice(0, 2)}/${enc}/${thumbName}`,
    descriptionUrl: `https://commons.wikimedia.org/wiki/File:${enc}`,
  };
}

export type FactLabels = Record<WikiFact["key"], string>;

/** Varlıktan küçük bilgi listesi; eksik olan atlanır. */
export function buildFacts(entity: Entity, labels: Record<string, string>, names: FactLabels): WikiFact[] {
  const facts: WikiFact[] = [];
  const join = (ids: string[]) => ids.map((id) => labels[id]).filter(Boolean).join(", ");
  const type = join(entityIds(entity, "P31"));
  if (type) facts.push({ key: "type", label: names.type, value: type });
  const inception = timeValue(entity, "P571");
  if (inception) facts.push({ key: "inception", label: names.inception, value: inception });
  const heritage = join(entityIds(entity, "P1435"));
  if (heritage) facts.push({ key: "heritage", label: names.heritage, value: heritage });
  const site = claimValues(entity, "P856").map(safeHttpsUrl).find(Boolean);
  if (site) facts.push({ key: "website", label: names.website, value: site.hostname.replace(/^www\./, ""), href: site.href });
  return facts;
}

/** Konum araması (list=geosearch) sonuçları. */
export function parseGeosearch(json: unknown): { title: string; dist: number }[] {
  if (!isObj(json) || !isObj(json.query) || !Array.isArray(json.query.geosearch)) return [];
  return json.query.geosearch.flatMap((r) => {
    if (!isObj(r) || r.ns !== 0) return [];
    const title = str(r.title);
    const dist = typeof r.dist === "number" ? r.dist : NaN;
    return title && Number.isFinite(dist) ? [{ title, dist }] : [];
  });
}
