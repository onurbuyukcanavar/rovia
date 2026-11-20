import { normalizeForSearch } from "@/lib/places/normalize";

/**
 * Konum araması (geosearch) sonucunun yer adıyla eşleşip eşleşmediği. Yanlış madde göstermektense hiç
 * göstermemek yeğdir: eşik yüksek tutulur, tür sözcükleri çelişirse (kale ≠ cami) eşleşme reddedilir.
 */

/** Tür sözcükleri (normalleştirilmiş): ad karşılaştırmasında çıkarılır, tür grubunu belirler. */
const TYPE_GROUPS: Record<string, string[]> = {
  castle: ["kale", "kalesi", "hisar", "hisari", "castle", "fortress", "fort", "citadel", "kastron"],
  ancient: ["antik", "kent", "kenti", "sehir", "sehri", "oren", "yeri", "orenyeri", "arkeolojik", "alan", "alani",
    "ancient", "city", "ruins", "archaeological", "site", "hoyuk", "hoyugu", "tumulus", "tumulusu"],
  museum: ["muze", "muzesi", "muzeler", "muzeleri", "museum"],
  mosque: ["cami", "camii", "camisi", "mescit", "mescidi", "mosque"],
  church: ["kilise", "kilisesi", "church", "manastir", "manastiri", "monastery", "basilica", "bazilika", "bazilikasi"],
  bridge: ["kopru", "koprusu", "bridge"],
  tomb: ["turbe", "turbesi", "tomb", "mausoleum", "anitmezar", "anitmezari", "kumbet", "kumbeti"],
  caravanserai: ["kervansaray", "kervansarayi", "han", "hani", "caravanserai"],
  theatre: ["tiyatro", "tiyatrosu", "theatre", "theater", "amfitiyatro", "amfitiyatrosu"],
  monument: ["anit", "aniti", "monument", "memorial", "heykel", "heykeli"],
  gate: ["kapi", "kapisi", "gate"],
};
const FILLER = new Set(["of", "the", "ve", "and", "at", "in"]);
const WORD_GROUP = new Map<string, string>();
for (const [group, words] of Object.entries(TYPE_GROUPS)) for (const w of words) WORD_GROUP.set(w, group);

export type TitleParts = { core: string; groups: Set<string> };

/** Türkçe duyarlı normalleştirme + parantezli belirteçlerin ("(Nevşehir)") ve tür sözcüklerinin ayrılması. */
export function titleParts(raw: string): TitleParts {
  const withoutParens = raw.replace(/\([^)]*\)/g, " ");
  const tokens = normalizeForSearch(withoutParens).split(" ").filter(Boolean);
  const groups = new Set<string>();
  const core: string[] = [];
  for (const tok of tokens) {
    const g = WORD_GROUP.get(tok);
    if (g) groups.add(g);
    else if (!FILLER.has(tok)) core.push(tok);
  }
  return { core: core.join(" "), groups };
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const compact = s.replace(/ /g, "");
  for (let i = 0; i < compact.length - 1; i++) {
    const bg = compact.slice(i, i + 2);
    out.set(bg, (out.get(bg) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice benzerliği (karakter ikilileri), 0..1. */
export function dice(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let sizeA = 0;
  let sizeB = 0;
  let inter = 0;
  for (const n of A.values()) sizeA += n;
  for (const [k, n] of B) {
    sizeB += n;
    inter += Math.min(n, A.get(k) ?? 0);
  }
  return sizeA + sizeB === 0 ? 0 : (2 * inter) / (sizeA + sizeB);
}

/** Yer adı ile madde başlığı benzerliği, 0..1. Tür sözcükleri çelişirse ya da ad yalnızca türden oluşuyorsa 0. */
export function titleSimilarity(placeName: string, articleTitle: string): number {
  const a = titleParts(placeName);
  const b = titleParts(articleTitle);
  if (a.core.length < 3 || b.core.length < 3) return 0;
  if (a.groups.size && b.groups.size && ![...a.groups].some((g) => b.groups.has(g))) return 0;
  return dice(a.core, b.core);
}

/** Eşleşme eşiği: yazım farklarına (Aphrodisias / Afrodisias) izin verir, farklı adlara vermez. */
export const MATCH_THRESHOLD = 0.82;

export type GeoCandidate = { title: string; dist: number };

/** En iyi eşleşen konum araması sonucu; eşik altındaysa null. Eşitlikte yakın olan kazanır. */
export function pickGeoMatch(placeName: string, candidates: GeoCandidate[]): GeoCandidate | null {
  let best: { c: GeoCandidate; score: number } | null = null;
  for (const c of candidates) {
    const score = titleSimilarity(placeName, c.title);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score || (score === best.score && c.dist < best.c.dist)) best = { c, score };
  }
  return best?.c ?? null;
}
