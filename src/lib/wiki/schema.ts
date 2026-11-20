import { z } from "zod";
import { isValidTitle, MAX_TITLE, parseWikipediaTag, WIKI_LANG_RE, WIKIDATA_RE } from "./tags";
import type { WikiLookup } from "./server";

/** Sunucu doğrulaması: ya wikipedia ("lang:Başlık") / wikidata ("Q123"), ya da ad + konum + kategori. */
const wikipedia = z.string().max(MAX_TITLE + 20).refine((v) => {
  const ref = parseWikipediaTag(v);
  return !!ref && WIKI_LANG_RE.test(ref.lang) && isValidTitle(ref.title);
}, "invalid wikipedia");

const refSchema = z.object({
  wikipedia: wikipedia.optional(),
  wikidata: z.string().regex(WIKIDATA_RE).optional(),
}).strict().refine((v) => !!v.wikipedia || !!v.wikidata, "wikipedia or wikidata");

const geoSchema = z.object({
  name: z.string().trim().min(1).max(MAX_TITLE),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  category: z.string().regex(/^[a-z_]{1,40}$/),
  subtype: z.string().regex(/^[a-z_:]{1,60}$/).optional(),
}).strict();

export const wikiSchema = z.union([refSchema, geoSchema]);
export type WikiInput = z.infer<typeof wikiSchema>;

/** Önbellek anahtarı kararlı olsun: başlık normalleştirilir, koordinat ~11 m'ye yuvarlanır. */
export function toLookup(input: WikiInput): WikiLookup {
  if ("name" in input) {
    const r = (v: number) => Math.round(v * 1e4) / 1e4;
    return { kind: "geo", name: input.name.trim(), lat: r(input.lat), lon: r(input.lon), category: input.category, subtype: input.subtype ?? null };
  }
  return { kind: "ref", wikipedia: parseWikipediaTag(input.wikipedia), wikidata: input.wikidata ?? null };
}
