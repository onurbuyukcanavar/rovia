import type { PdfImage } from "./document";

/**
 * Tarayıcıda fotoğrafları PDF'e uygun JPEG veri adreslerine çevirir.
 * react-pdf yalnızca JPEG/PNG okur; fotoğraflarımız WebP/JPEG olabilir → canvas üzerinden yeniden kodlanır.
 * Yüklenemeyen görseller atlanır.
 */
export type ImageJob = { mediaId: string; url: string; maxPx: number };

async function decode(blob: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // Bazı tarayıcılar seçeneği/biçimi desteklemez; <img> ile devam
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function toPdfImage(url: string, maxPx: number, signal?: AbortSignal): Promise<PdfImage> {
  const res = await fetch(url, { mode: "cors", credentials: "omit", signal });
  if (!res.ok) throw new Error(`IMAGE_HTTP_${res.status}`);
  const img = await decode(await res.blob());
  try {
    const k = Math.min(1, maxPx / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * k));
    const height = Math.max(1, Math.round(img.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.fillStyle = "#ffffff"; // saydam PNG/WebP için beyaz zemin
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.source, 0, 0, width, height);
    return { src: canvas.toDataURL("image/jpeg", 0.85), width, height };
  } finally {
    img.close();
  }
}

/** İşleri en fazla `concurrency` eşzamanlı yürütür; aynı görsel için en büyük boyut kullanılır. */
export async function prepareImages(
  jobs: ImageJob[],
  opts: { concurrency?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<{ images: Map<string, PdfImage>; failed: number }> {
  const byId = new Map<string, ImageJob>();
  for (const j of jobs) {
    const prev = byId.get(j.mediaId);
    if (!prev || prev.maxPx < j.maxPx) byId.set(j.mediaId, j);
  }
  const queue = [...byId.values()];
  const images = new Map<string, PdfImage>();
  let done = 0;
  let failed = 0;
  opts.onProgress?.(0, queue.length);
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      if (opts.signal?.aborted) return;
      try {
        images.set(job.mediaId, await toPdfImage(job.url, job.maxPx, opts.signal));
      } catch (e) {
        failed++;
        console.warn("[rovia] PDF görseli atlandı:", job.mediaId, e);
      }
      opts.onProgress?.(++done, byId.size);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 4, queue.length) }, worker));
  return { images, failed };
}
