import { pdf } from "@react-pdf/renderer";
import type { Travelogue } from "@/lib/travelogue/types";
import { BookDocument, type PdfImage } from "./document";
import { registerBookFonts } from "./fonts";
import { prepareImages } from "./images";
import { renderMapImage } from "./map-image";
import { buildBook, imageNeeds, slugify } from "./model";
import { t } from "@/i18n";

/**
 * Tarayıcıda seyahatname PDF'i üretir (sunucu maliyeti yok). PdfExportButton dinamik olarak içe aktarır;
 * böylece @react-pdf/renderer ilk yüklemeye girmez.
 */
export type PdfProgress =
  | { phase: "photos"; done: number; total: number }
  | { phase: "map" }
  | { phase: "building" };

export async function generateBookPdf(
  travelogue: Travelogue,
  opts: { styleUrl: string; fontBase?: string; onProgress?: (p: PdfProgress) => void; signal?: AbortSignal },
): Promise<{ blob: Blob; fileName: string; skippedPhotos: number }> {
  registerBookFonts(opts.fontBase ?? "/fonts");
  const model = buildBook(travelogue);

  const { images, failed } = await prepareImages(imageNeeds(model), {
    concurrency: 4,
    signal: opts.signal,
    onProgress: (done, total) => opts.onProgress?.({ phase: "photos", done, total }),
  });
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  let mapImage: PdfImage | null = null;
  const mapSec = model.sections.find((s) => s.kind === "map");
  if (mapSec?.kind === "map") {
    opts.onProgress?.({ phase: "map" });
    mapImage = await renderMapImage(mapSec, opts.styleUrl);
  }
  if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");

  opts.onProgress?.({ phase: "building" });
  // Arayüzün ilerleme durumunu çizebilmesi için bir kare bekle
  await new Promise((r) => setTimeout(r, 30));
  const blob = await pdf(<BookDocument model={model} assets={{ images, mapImage }} />).toBlob();
  return { blob, fileName: `${slugify(travelogue.title, t.travelogue.book.pdf.fallbackName)}.pdf`, skippedPhotos: failed };
}
