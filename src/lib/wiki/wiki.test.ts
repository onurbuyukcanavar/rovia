import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import entityJson from "../../../tests/fixtures/wiki/entity.json";
import geoJson from "../../../tests/fixtures/wiki/geosearch-tr.json";
import labelsJson from "../../../tests/fixtures/wiki/labels.json";
import disambJson from "../../../tests/fixtures/wiki/summary-disambiguation.json";
import evilJson from "../../../tests/fixtures/wiki/summary-evil.json";
import summaryJson from "../../../tests/fixtures/wiki/summary-tr.json";
import { cityOf, tripadvisorUrl } from "@/lib/explore/geo";
import { MATCH_THRESHOLD, pickGeoMatch, titleParts, titleSimilarity } from "./match";
import {
  buildFacts, clampText, commonsImage, formatWikidataTime, imageDescriptionUrl, parseEntity, parseGeosearch, parseLabels,
  parseSummary, pickSitelink, safeUploadUrl,
} from "./parse";
import { toLookup, wikiSchema } from "./schema";
import { isGeoMatchEligible, parseWikidataTag, parseWikipediaTag, wikiRequestFor } from "./tags";

const LABELS = { type: "Türü", inception: "Yapım / kuruluş", heritage: "Koruma statüsü", website: "Resmî web sitesi" };

describe("etiket ve girdi doğrulama", () => {
  it("wikipedia etiketi", () => {
    expect(parseWikipediaTag("tr:Uçhisar Kalesi")).toEqual({ lang: "tr", title: "Uçhisar Kalesi" });
    expect(parseWikipediaTag(" en:Hagia_Sophia ")).toEqual({ lang: "en", title: "Hagia Sophia" });
    expect(parseWikipediaTag("zh-yue:某")).toEqual({ lang: "zh-yue", title: "某" });
    expect(parseWikipediaTag("Uçhisar Kalesi")).toBeNull();
    expect(parseWikipediaTag("evil.com/x:Title")).toBeNull();
    expect(parseWikipediaTag("t:Kısa")).toBeNull();
    expect(parseWikipediaTag("tr:A|B")).toBeNull();
    expect(parseWikipediaTag(`tr:${"a".repeat(301)}`)).toBeNull();
    expect(parseWikipediaTag("tr:")).toBeNull();
  });

  it("wikidata etiketi", () => {
    expect(parseWikidataTag("Q1765283")).toBe("Q1765283");
    expect(parseWikidataTag("Q1;Q2")).toBe("Q1");
    expect(parseWikidataTag("q1")).toBeNull();
    expect(parseWikidataTag("Q1234567890123")).toBeNull();
    expect(parseWikidataTag("P31")).toBeNull();
  });

  it("sunucu şeması", () => {
    expect(wikiSchema.safeParse({ wikipedia: "tr:Efes" }).success).toBe(true);
    expect(wikiSchema.safeParse({ wikidata: "Q42" }).success).toBe(true);
    expect(wikiSchema.safeParse({}).success).toBe(false);
    expect(wikiSchema.safeParse({ wikidata: "Q42 " }).success).toBe(false);
    expect(wikiSchema.safeParse({ wikipedia: "evil.example.com:x" }).success).toBe(false);
    expect(wikiSchema.safeParse({ wikipedia: "tr:Efes", host: "evil.example.com" }).success).toBe(false);
    expect(wikiSchema.safeParse({ name: "Efes", lat: 37.94, lon: 27.34, category: "historic" }).success).toBe(true);
    expect(wikiSchema.safeParse({ name: "Efes", lat: 91, lon: 27, category: "historic" }).success).toBe(false);
    expect(wikiSchema.safeParse({ name: "Efes", lat: 37, lon: -181, category: "historic" }).success).toBe(false);
    expect(wikiSchema.safeParse({ name: "", lat: 37, lon: 27, category: "historic" }).success).toBe(false);
    expect(wikiSchema.safeParse({ name: "x".repeat(301), lat: 37, lon: 27, category: "historic" }).success).toBe(false);
    expect(wikiSchema.safeParse({ name: "Efes", lat: 37, lon: 27, category: "Historic!" }).success).toBe(false);
  });

  it("önbellek anahtarı kararlı", () => {
    const a = toLookup({ name: " Efes ", lat: 37.939123, lon: 27.341249, category: "historic" });
    expect(a).toEqual({ kind: "geo", name: "Efes", lat: 37.9391, lon: 27.3412, category: "historic", subtype: null });
    expect(toLookup({ wikipedia: "tr:Uçhisar_Kalesi" })).toEqual({ kind: "ref", wikipedia: { lang: "tr", title: "Uçhisar Kalesi" }, wikidata: null });
  });

  it("istemci isteği: etiket varsa onlar, yoksa yalnızca uygun kategorilerde konum + ad", () => {
    const base = { name: "Uçhisar Kalesi", location: { lat: 38.630312, lng: 34.805512 }, category: "historic", subtype: "castle" };
    expect(wikiRequestFor({ ...base, tags: { wikipedia: "tr:Uçhisar Kalesi", wikidata: "Q1765283" } }))
      .toEqual({ wikipedia: "tr:Uçhisar Kalesi", wikidata: "Q1765283" });
    expect(wikiRequestFor({ ...base, tags: {} }))
      .toEqual({ name: "Uçhisar Kalesi", lat: 38.63031, lon: 34.80551, category: "historic", subtype: "castle" });
    expect(wikiRequestFor({ ...base, category: "fuel", subtype: "fuel", tags: {} })).toBeNull();
    expect(wikiRequestFor({ ...base, name: "  ", tags: {} })).toBeNull();
    expect(isGeoMatchEligible("museum")).toBe(true);
    expect(isGeoMatchEligible("nature", "peak")).toBe(false);
    expect(isGeoMatchEligible("worship", "muslim")).toBe(false);
  });
});

describe("başlık normalleştirme ve benzerlik", () => {
  it("Türkçe harfler, parantez ve tür sözcükleri", () => {
    expect(titleParts("İSTANBUL ARKEOLOJİ MÜZESİ").core).toBe("istanbul arkeoloji");
    expect([...titleParts("İstanbul Arkeoloji Müzeleri").groups]).toEqual(["museum"]);
    expect(titleParts("Hierapolis (Pamukkale)").core).toBe("hierapolis");
    expect(titleParts("Efes Antik Kenti")).toEqual({ core: "efes", groups: new Set(["ancient"]) });
    expect(titleParts("Iğdır Kalesi").core).toBe("igdir");
  });

  it("aynı yer yüksek benzerlik", () => {
    expect(titleSimilarity("Uçhisar Kalesi", "Uçhisar Kalesi")).toBe(1);
    expect(titleSimilarity("Efes", "Efes Antik Kenti")).toBe(1);
    expect(titleSimilarity("Efes Ören Yeri", "Efes")).toBe(1);
    expect(titleSimilarity("Hierapolis Antik Kenti", "Hierapolis (Pamukkale)")).toBe(1);
    expect(titleSimilarity("Sümela Manastırı", "Sumela Manastiri")).toBe(1);
    expect(titleSimilarity("Alahan Manastırı", "Alahan Manastır")).toBe(1);
    expect(titleSimilarity("UCHISAR KALESI", "Uçhisar Kalesi")).toBe(1);
  });

  it("farklı yer ya da çelişen tür reddedilir", () => {
    expect(titleSimilarity("Uçhisar Kalesi", "Uçhisar")).toBe(1); // tür yok ↔ kale: çelişki değil
    expect(titleSimilarity("Uçhisar Kalesi", "Uçhisar Camii")).toBe(0);
    expect(titleSimilarity("Kale", "Kale (Denizli)")).toBe(0);
    expect(titleSimilarity("Göreme Açık Hava Müzesi", "Göreme")).toBeLessThan(MATCH_THRESHOLD);
    expect(titleSimilarity("Aspendos Tiyatrosu", "Perge")).toBeLessThan(MATCH_THRESHOLD);
    expect(titleSimilarity("Selçuk", "Seleukeia")).toBeLessThan(MATCH_THRESHOLD);
  });

  it("konum araması: en iyi eşleşme, eşitlikte en yakın; ad dışı sonuçlar elenir", () => {
    const cands = parseGeosearch(geoJson);
    expect(cands.map((c) => c.title)).toEqual(["Uçhisar", "Uçhisar Kalesi", "Güvercinlik Vadisi"]);
    expect(pickGeoMatch("Uçhisar Kalesi", cands)?.title).toBe("Uçhisar Kalesi");
    expect(pickGeoMatch("Ortahisar Kalesi", cands)).toBeNull();
    expect(pickGeoMatch("Uçhisar Kalesi", [])).toBeNull();
    expect(parseGeosearch({ error: { code: "x" } })).toEqual([]);
  });
});

describe("Vikipedi özeti", () => {
  it("düz metin, küçük resim ve madde bağlantısı", () => {
    const s = parseSummary(summaryJson, "tr")!;
    expect(s).toMatchObject({
      title: "Uçhisar Kalesi",
      description: "Nevşehir'de bir kale",
      url: "https://tr.wikipedia.org/wiki/U%C3%A7hisar_Kalesi",
      lang: "tr",
      wikibaseItem: "Q1765283",
      thumbnail: { width: 320, height: 213 },
      imageDescriptionUrl: "https://commons.wikimedia.org/wiki/File:U%C3%A7hisar_Castle.jpg",
    });
    expect(s.thumbnail!.src.startsWith("https://upload.wikimedia.org/")).toBe(true);
    expect(s.extract).not.toContain("<");
  });

  it("anlam ayrımı ve geçersiz alanlar", () => {
    expect(parseSummary(disambJson, "tr")).toBeNull();
    expect(parseSummary(null, "tr")).toBeNull();
    expect(parseSummary({ type: "standard", title: "X" }, "tr")).toBeNull();
    const evil = parseSummary(evilJson, "tr")!;
    expect(evil.thumbnail).toBeUndefined();
    expect(evil.wikibaseItem).toBeUndefined();
    expect(evil.url).toBe("https://tr.wikipedia.org/wiki/K%C3%B6t%C3%BC");
  });

  it("görsel adresi yalnızca upload.wikimedia.org", () => {
    expect(safeUploadUrl("https://upload.wikimedia.org/a.jpg")).toBe("https://upload.wikimedia.org/a.jpg");
    expect(safeUploadUrl("http://upload.wikimedia.org/a.jpg")).toBeUndefined();
    expect(safeUploadUrl("https://upload.wikimedia.org.evil.com/a.jpg")).toBeUndefined();
    expect(safeUploadUrl("https://user@upload.wikimedia.org/a.jpg")).toBeUndefined();
    expect(imageDescriptionUrl("https://upload.wikimedia.org/wikipedia/tr/thumb/a/ab/Logo.png/100px-Logo.png"))
      .toBe("https://tr.wikipedia.org/wiki/File:Logo.png");
  });

  it("uzun metin cümle sınırında kısaltılır", () => {
    const text = `${"Birinci cümle burada. ".repeat(80)}Son`;
    const out = clampText(text, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("Wikidata", () => {
  const entity = parseEntity(entityJson, "Q1765283")!;

  it("site bağlantısı: Türkçe öncelikli", () => {
    expect(pickSitelink(entity)).toEqual({ lang: "tr", title: "Uçhisar Kalesi" });
    expect(pickSitelink({ ...entity, sitelinks: { enwiki: "Uchisar" } })).toEqual({ lang: "en", title: "Uchisar" });
    expect(pickSitelink({ ...entity, sitelinks: { dewiki: "Uçhisar" } })).toBeNull();
    expect(parseEntity({ entities: { Q1: { id: "Q1", missing: "" } } }, "Q1")).toBeNull();
  });

  it("bilgiler: Türkçe etiket, İngilizce yedek, eksikler atlanır, yalnızca https site", () => {
    const facts = buildFacts(entity, parseLabels(labelsJson), LABELS);
    expect(facts).toEqual([
      { key: "type", label: "Türü", value: "kale, tourist attraction" },
      { key: "inception", label: "Yapım / kuruluş", value: "12. yüzyıl" },
      { key: "heritage", label: "Koruma statüsü", value: "UNESCO Dünya Mirası" },
      { key: "website", label: "Resmî web sitesi", value: "nevsehir.gov.tr", href: "https://www.nevsehir.gov.tr/uchisar" },
    ]);
    expect(buildFacts({ id: "Q1", sitelinks: {}, claims: {} }, {}, LABELS)).toEqual([]);
  });

  it("zaman biçimi", () => {
    expect(formatWikidataTime({ time: "+1205-03-01T00:00:00Z", precision: 11 })).toBe("1205");
    expect(formatWikidataTime({ time: "-0334-00-00T00:00:00Z", precision: 9 })).toBe("MÖ 334");
    expect(formatWikidataTime({ time: "-0400-00-00T00:00:00Z", precision: 7 })).toBe("MÖ 4. yüzyıl");
    expect(formatWikidataTime({ time: "+1890-00-00T00:00:00Z", precision: 8 })).toBe("1890'lar");
    expect(formatWikidataTime({ time: "-3000-00-00T00:00:00Z", precision: 6 })).toBe("MÖ 3. binyıl");
    expect(formatWikidataTime({ time: "+1000000-00-00T00:00:00Z", precision: 3 })).toBeUndefined();
    expect(formatWikidataTime({ time: "dün", precision: 9 })).toBeUndefined();
  });

  it("Commons görseli (P18) → upload.wikimedia.org küçük resmi", () => {
    const md5 = createHash("md5").update("Uçhisar_Castle.jpg").digest("hex");
    const img = commonsImage("Uçhisar Castle.jpg", md5)!;
    expect(img.src).toBe(`https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/U%C3%A7hisar_Castle.jpg/640px-U%C3%A7hisar_Castle.jpg`);
    expect(img.descriptionUrl).toBe("https://commons.wikimedia.org/wiki/File:U%C3%A7hisar_Castle.jpg");
    expect(commonsImage("Harita.svg", md5)!.src.endsWith("640px-Harita.svg.png")).toBe(true);
    expect(commonsImage("../x.jpg", md5)).toBeNull();
    expect(commonsImage("Belge.pdf", md5)).toBeNull();
    expect(commonsImage("x.jpg", "nothex")).toBeNull();
  });
});

describe("Tripadvisor bağlantısı", () => {
  it("Türkçe karakterler kodlanır, il eklenir", () => {
    expect(tripadvisorUrl("Uçhisar Kalesi", "Nevşehir"))
      .toBe("https://www.tripadvisor.com.tr/Search?q=U%C3%A7hisar%20Kalesi%20Nev%C5%9Fehir");
    expect(tripadvisorUrl("İshak Paşa Sarayı")).toBe("https://www.tripadvisor.com.tr/Search?q=%C4%B0shak%20Pa%C5%9Fa%20Saray%C4%B1");
    expect(tripadvisorUrl("Nevşehir Müzesi", "NEVŞEHİR")).toBe("https://www.tripadvisor.com.tr/Search?q=Nev%C5%9Fehir%20M%C3%BCzesi");
  });

  it("başka alan adı enjekte edilemez; ad yoksa bağlantı yok", () => {
    for (const evil of ["https://evil.com", "//evil.com/x", "a&q=b#frag", "@evil.com", "x/../../evil?y=1"]) {
      const url = new URL(tripadvisorUrl(evil, "x/../evil.com")!);
      expect(url.origin).toBe("https://www.tripadvisor.com.tr");
      expect(url.pathname).toBe("/Search");
      expect([...url.searchParams.keys()]).toEqual(["q"]);
      expect(url.hash).toBe("");
    }
    expect(tripadvisorUrl("")).toBeNull();
    expect(tripadvisorUrl("   ", "Nevşehir")).toBeNull();
    expect(tripadvisorUrl(null)).toBeNull();
    expect(cityOf("Ürgüp, Nevşehir")).toBe("Nevşehir");
    expect(cityOf(null)).toBeNull();
  });
});
