import { describe, expect, it } from "vitest";
import { blockImageIds, docToBlocks } from "./blocks";
import { buildBook, entryTitle, formatDateRange, imageNeeds, slugify, travelogueDateRange, travelogueRoute } from "./model";
import { fitBox } from "./document";
import type { Travelogue, TravelogueEntry, TravelogueSection } from "@/lib/travelogue/types";
import type { Doc } from "@/lib/travelogue/doc";
import { encodePolyline } from "@/lib/geo";

const IMG = "11111111-1111-4111-8111-111111111111";
const IMG2 = "22222222-2222-4222-8222-222222222222";

describe("slugify", () => {
  it("Türkçe karakterleri sadeleştirir", () => {
    expect(slugify("Kapadokya'da Üç Gün: Göreme & Çavuşin")).toBe("kapadokyada-uc-gun-goreme-cavusin");
    expect(slugify("IĞDIR İSTANBUL Şile")).toBe("igdir-istanbul-sile");
  });
  it("boşsa yedek ad döner", () => {
    expect(slugify("  !!! ")).toBe("seyahatname");
    expect(slugify("", "x")).toBe("x");
  });
});

describe("formatDateRange", () => {
  it("aynı gün", () => expect(formatDateRange("2026-05-12T08:00:00Z", "2026-05-12T15:00:00Z")).toBe("12 Mayıs 2026"));
  it("aynı ay", () => expect(formatDateRange("2026-05-12T08:00:00Z", "2026-05-15T08:00:00Z")).toBe("12–15 Mayıs 2026"));
  it("aynı yıl", () => expect(formatDateRange("2026-04-28T08:00:00Z", "2026-05-03T08:00:00Z")).toBe("28 Nisan – 3 Mayıs 2026"));
  it("farklı yıl ve ters sıra", () =>
    expect(formatDateRange("2026-01-02T08:00:00Z", "2025-12-30T08:00:00Z")).toBe("30 Aralık 2025 – 2 Ocak 2026"));
  it("tek uç veya hiç", () => {
    expect(formatDateRange(null, "2026-05-12T08:00:00Z")).toBe("12 Mayıs 2026");
    expect(formatDateRange(null, null)).toBeNull();
  });
  it("İstanbul saatine göre gün", () => expect(formatDateRange("2026-05-11T22:30:00Z", null)).toBe("12 Mayıs 2026"));
});

describe("docToBlocks", () => {
  const doc: Doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Başlık" }] },
      { type: "paragraph", content: [
        { type: "text", text: "Kalın ", marks: [{ type: "bold" }] },
        { type: "text", text: "yazı", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        { type: "text", text: "bağlantı", marks: [{ type: "link", attrs: { href: "https://rovia.app" } }, { type: "italic" }] },
      ] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "   " }] },
      { type: "orderedList", attrs: { start: 3 }, content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "bir" }] }] },
        { type: "listItem", content: [{ type: "paragraph" }] },
      ] },
      { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "alıntı" }] }] },
      { type: "horizontalRule" },
      { type: "roviaImage", attrs: { mediaId: IMG, caption: " Göl " } },
      { type: "unknown", content: [{ type: "text", text: "x" }] },
    ],
  };

  it("blokları ve işaretleri çevirir", () => {
    const blocks = docToBlocks(doc);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "quote", "hr", "image"]);
    expect(blocks[0]).toEqual({ type: "heading", level: 3, runs: [{ text: "Başlık" }] });
    expect(blocks[1]).toEqual({
      type: "paragraph",
      runs: [{ text: "Kalın yazı", bold: true }, { text: "\n" }, { text: "bağlantı", italic: true, href: "https://rovia.app/" }],
    });
    expect(blocks[2]).toMatchObject({ type: "list", ordered: true, start: 3, items: [[{ type: "paragraph" }]] });
    expect(blocks[5]).toEqual({ type: "image", mediaId: IMG, caption: "Göl" });
    expect(blockImageIds(blocks)).toEqual([IMG]);
  });
  it("boş belge", () => {
    expect(docToBlocks(null)).toEqual([]);
    expect(docToBlocks({ type: "doc", content: [] })).toEqual([]);
  });
});

describe("fitBox", () => {
  it("oranı koruyarak sığdırır", () => {
    expect(fitBox(1600, 1200, 400, 400)).toEqual({ width: 400, height: 300 });
    expect(fitBox(900, 1600, 400, 400)).toEqual({ width: 225, height: 400 });
  });
});

// ── Model ─────────────────────────────────────────────────────────────────────

const para = (text: string): Doc => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

function entry(over: Partial<TravelogueEntry>): TravelogueEntry {
  return {
    id: "e", entryType: "place", title: "", introduction: null, narrative: null, historyNotes: null, personalReview: null,
    contentText: null, locationName: null, address: null, lat: null, lng: null, osmRef: null, savedPlaceId: null,
    visitedAt: null, tags: [], sortOrder: 0, version: 1, aiAssisted: false, createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z", photos: [], ...over,
  };
}

function section(kind: TravelogueSection["kind"], sortOrder: number, over: Partial<TravelogueSection> = {}): TravelogueSection {
  return { id: `s-${kind}`, kind, title: "", content: null, isVisible: true, sortOrder, version: 1, ...over };
}

function sample(over: Partial<Travelogue> = {}): Travelogue {
  return {
    id: "t", title: "Ege Turu", subtitle: null, purpose: "Dinlenmek", summary: null, coverMediaId: null, ordering: "manual",
    status: "draft", version: 1, createdAt: "", updatedAt: "", trip: null,
    sections: [
      section("cover", 0), section("introduction", 1), section("trip_info", 2), section("map", 3), section("chronicle", 4),
      section("places", 5), section("gallery", 6), section("evaluation", 7), section("epilogue", 8, { isVisible: false, content: para("gizli") }),
    ],
    entries: [
      entry({ id: "a", title: "", locationName: "Efes", lat: 37.94, lng: 27.34, visitedAt: "2026-05-12T09:00:00Z", photos: [{ mediaId: IMG, caption: "Kütüphane" }], narrative: para("Anlatı") }),
      entry({ id: "b", title: "Şirince", visitedAt: "2026-05-14T09:00:00Z", photos: [{ mediaId: IMG, caption: null }, { mediaId: IMG2, caption: null }] }),
    ],
    media: [IMG, IMG2].map((id) => ({ id, tripId: null, thumbUrl: `https://x/${id}/t`, url: `https://x/${id}`, width: 1600, height: 1200, takenAt: null, createdAt: "", lat: null, lng: null, caption: id === IMG2 ? "Bağlar" : null })),
    ...over,
  };
}

describe("buildBook", () => {
  it("görünür bölümleri sırasıyla, boş otomatik bölümleri atlayarak kurar", () => {
    const m = buildBook(sample());
    expect(m.sections.map((s) => s.kind)).toEqual(["cover", "text", "trip_info", "map", "chronicle", "places", "gallery"]);
    const cover = m.sections[0];
    expect(cover).toMatchObject({ kind: "cover", title: "Ege Turu", coverMediaId: IMG, dateRange: "12–14 Mayıs 2026", route: "Efes" });
    expect(m.sections[1]).toMatchObject({ kind: "text", title: "Giriş", purpose: "Dinlenmek" });
  });

  it("yazıları numaralandırır, başlık yedeği ve alanlar", () => {
    const m = buildBook(sample());
    expect(m.entries.map((e) => [e.number, e.title, e.anchor])).toEqual([[1, "Efes", "entry-a"], [2, "Şirince", "entry-b"]]);
    expect(m.entries[0].fields.map((f) => f.label)).toEqual(["Anlatı"]);
    expect(m.entries[1].photos[1]).toEqual({ mediaId: IMG2, caption: "Bağlar" });
    expect(entryTitle({ title: " ", locationName: null })).toBe("Adsız yazı");
  });

  it("galeri tekrarsız, harita yalnızca konumlu yazılar, bilgiler yalnızca olanlar", () => {
    const m = buildBook(sample());
    const gallery = m.sections.find((s) => s.kind === "gallery");
    expect(gallery?.kind === "gallery" && gallery.photos.map((p) => p.mediaId)).toEqual([IMG, IMG2]);
    const map = m.sections.find((s) => s.kind === "map");
    expect(map?.kind === "map" && map.markers.map((x) => x.number)).toEqual([1]);
    const info = m.sections.find((s) => s.kind === "trip_info");
    expect(info?.kind === "trip_info" && info.facts.map((f) => f.key)).toEqual(["dates", "entries", "photos"]);
  });

  it("yolculuk bilgisi ve rota çizgisi", () => {
    const polyline = encodePolyline([{ lat: 38.4, lng: 27.1 }, { lat: 37.9, lng: 27.3 }]);
    const tv = sample({
      trip: { id: "tr", title: "", startedAt: "2026-05-10T06:00:00Z", endedAt: "2026-05-16T18:00:00Z", distanceM: 412_300, elapsedS: 3 * 3600 + 600, startLabel: "İzmir", endLabel: "Selçuk", polyline },
    });
    const m = buildBook(tv);
    expect(m.dateRange).toBe("10–16 Mayıs 2026");
    expect(travelogueRoute(tv)).toBe("İzmir → Selçuk");
    const info = m.sections.find((s) => s.kind === "trip_info");
    expect(info?.kind === "trip_info" && info.facts.map((f) => f.value)).toEqual(["412 km", "3 sa 10 dk", "10–16 Mayıs 2026", "İzmir", "Selçuk", "2", "2"]);
    const map = m.sections.find((s) => s.kind === "map");
    expect(map?.kind === "map" && map.paths[0].length).toBe(2);
  });

  it("boş seyahatname: yalnızca kapak", () => {
    const m = buildBook(sample({ entries: [], purpose: null }));
    expect(m.sections.map((s) => s.kind)).toEqual(["cover"]);
    expect(travelogueDateRange({ trip: null, entries: [] })).toBeNull();
  });

  it("görsel ihtiyaçları: kapak tam, ızgara küçük", () => {
    const needs = imageNeeds(buildBook(sample()));
    expect(needs.filter((n) => n.mediaId === IMG).map((n) => n.maxPx)).toContain(1600);
    expect(needs.find((n) => n.mediaId === IMG2)?.maxPx).toBe(900);
  });
});
