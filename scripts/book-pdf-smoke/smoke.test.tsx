/**
 * Seyahatname PDF duman testi (Node): örnek bir seyahatnameyi yerel yazı tipleri ve üretilmiş bir JPEG ile
 * PDF'e çevirir. Kullanım: npx vitest run --config scripts/book-pdf-smoke/vitest.config.ts
 * (react-pdf yalnızca ESM; tsx/CJS ile yüklenemediği için vitest üzerinden çalışır.)
 */
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import path from "node:path";
import sharp from "sharp";
import { renderToBuffer } from "@react-pdf/renderer";
import { BookDocument, type PdfImage } from "@/lib/travelogue/pdf/document";
import { registerBookFonts } from "@/lib/travelogue/pdf/fonts";
import { buildBook } from "@/lib/travelogue/pdf/model";
import type { Travelogue } from "@/lib/travelogue/types";
import type { Doc } from "@/lib/travelogue/doc";

const IMG = "11111111-1111-4111-8111-111111111111";
const out = process.env.BOOK_PDF_OUT ?? "/tmp/book-sample.pdf";

async function main() {
  registerBookFonts(path.join(process.cwd(), "public/fonts"));
  const jpeg = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 232, g: 145, b: 45 } } }).jpeg().toBuffer();
  const img: PdfImage = { src: `data:image/jpeg;base64,${jpeg.toString("base64")}`, width: 320, height: 240 };

  const long = "Çağlayan ırmağın kıyısında ağır ağır yürüdük; şövalye kalıntıları, ığdır kayısısı ve İstanbul'dan gelen öğretmenler. ".repeat(14);
  const doc: Doc = { type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: long }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Göreme Açık Hava Müzesi" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Kalın ", marks: [{ type: "bold" }] }, { type: "text", text: "italik ", marks: [{ type: "italic" }] },
      { type: "text", text: "bağlantı", marks: [{ type: "link", attrs: { href: "https://example.org" } }] },
    ] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Şüphesiz üzüm bağları" }] }] }] },
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Ilık öğle" }] }] }] },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Yol, yürüyene görünür." }] }] },
    { type: "horizontalRule" },
    { type: "roviaImage", attrs: { mediaId: IMG, caption: "Peri bacaları, gün doğumu" } },
  ] };
  const sec = (kind: Travelogue["sections"][number]["kind"], i: number, content: Doc | null = null) =>
    ({ id: `s${i}`, kind, title: "", content, isVisible: true, sortOrder: i, version: 1 });
  const tv: Travelogue = {
    id: "t", title: "Kapadokya'da Üç Gün", subtitle: "Işığın ve taşın şiiri", purpose: "Doğayı ve tarihi yavaş yavaş görmek.", summary: "Üç günlük, dinlendirici bir gezi.",
    coverMediaId: IMG, ordering: "manual", status: "draft", version: 1, createdAt: "", updatedAt: "",
    trip: { id: "tr", title: "", startedAt: "2026-05-12T06:00:00Z", endedAt: "2026-05-14T18:00:00Z", distanceM: 734_500, elapsedS: 9 * 3600, startLabel: "Ankara", endLabel: "Ürgüp", polyline: null },
    sections: [sec("cover", 0), sec("introduction", 1, doc), sec("trip_info", 2), sec("map", 3), sec("chronicle", 4), sec("places", 5), sec("gallery", 6), sec("epilogue", 7, doc)],
    entries: [1, 2, 3].map((n) => ({
      id: `e${n}`, entryType: "place" as const, title: n === 2 ? "" : `Durak ${n}: Çavuşin`, introduction: doc, narrative: doc, historyNotes: null, personalReview: doc,
      contentText: null, locationName: "Uçhisar Kalesi", address: "Uçhisar, Nevşehir", lat: 38.63 + n / 100, lng: 34.8, osmRef: null, savedPlaceId: null,
      visitedAt: `2026-05-1${n + 1}T09:30:00Z`, tags: ["tarih", "manzara"], sortOrder: n, version: 1, aiAssisted: n === 1, createdAt: "", updatedAt: "",
      photos: [{ mediaId: IMG, caption: "Çıkrıkçı ustası" }, { mediaId: IMG, caption: null }],
    })),
    media: [{ id: IMG, tripId: null, thumbUrl: "x", url: "x", width: 320, height: 240, takenAt: null, createdAt: "", lat: null, lng: null, caption: null }],
  };

  const model = buildBook(tv);
  const buf = await renderToBuffer(<BookDocument model={model} assets={{ images: new Map([[IMG, img]]), mapImage: img }} />);
  writeFileSync(out, buf);
  const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(`${out}: ${buf.length} bayt, ${pages} sayfa`);
  return pages;
}

it("seyahatname PDF'i oluşturur", async () => {
  expect(await main()).toBeGreaterThan(5);
}, 120_000);
