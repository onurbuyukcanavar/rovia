import { mapsHandler } from "@/lib/api/maps-handler";
import { getWikiInfo, WikiUpstreamError } from "@/lib/wiki/server";
import { wikiSchema, toLookup } from "@/lib/wiki/schema";

/**
 * Yer için Vikipedi/Wikidata bilgisi (oturum + "wiki" hız sınırı). Yanıt: { info: WikiInfo | null }.
 * Geçici Wikimedia hataları kullanıcıya hata olarak yansımaz: bölüm yalnızca gösterilmez.
 */
export const POST = mapsHandler("wiki", wikiSchema, async (input) => {
  try {
    return { info: await getWikiInfo(toLookup(input)) };
  } catch (e) {
    // Önbellek sınırından geçen hata örneği korunmayabilir: adına da bakılır
    if (!(e instanceof WikiUpstreamError) && (e as Error)?.name !== "WikiUpstreamError") throw e;
    console.warn("[wiki] geçici hata:", (e as Error).message);
    return { info: null };
  }
}, { maxBodyBytes: 4096 });
