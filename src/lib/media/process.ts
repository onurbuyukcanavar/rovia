"use client";

/**
 * Fotoğrafı yüklemeye hazırlar — tamamen tarayıcıda:
 * 1. EXIF'ten çekim zamanı ve konumu okunur (kullanıcının arşivinde fotoğrafı doğru yere/zamana koymak için).
 * 2. Görsel yeniden çizilip WebP (desteklenmiyorsa JPEG) olarak kodlanır. Böylece dosyadaki tüm
 *    meta veri (GPS, cihaz bilgisi) silinir; paylaşımda konum sızmaz. Yön (orientation) uygulanır.
 * 3. Büyük görsel en fazla 2560 px, küçük görsel 480 px.
 */

export const MEDIA_LIMITS = { inputBytes: 40 * 1024 * 1024, mainPx: 2560, thumbPx: 480, perBatch: 20 };

export type ProcessedImage = {
  main: Blob;
  thumb: Blob;
  ext: "webp" | "jpg";
  width: number;
  height: number;
  takenAt: string | null;
  lat: number | null;
  lng: number | null;
};

export class MediaError extends Error {
  constructor(public code: "not_image" | "too_large" | "decode_failed") {
    super(code);
  }
}

const ACCEPTED = /^image\/(jpeg|png|webp|heic|heif|avif|gif)$/;
const ACCEPTED_EXT = /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i;

export function isAcceptedImage(file: File) {
  return ACCEPTED.test(file.type) || (!file.type && ACCEPTED_EXT.test(file.name));
}

async function readExif(file: File): Promise<{ takenAt: string | null; lat: number | null; lng: number | null }> {
  try {
    const { default: exifr } = await import("exifr");
    // "pick" kullanılınca GPS etiketleri de açıkça istenmeli; yoksa latitude/longitude hesaplanmaz
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"],
    });
    const when: unknown = data?.DateTimeOriginal ?? data?.CreateDate;
    const takenAt = when instanceof Date && !Number.isNaN(when.getTime()) ? when.toISOString() : null;
    const lat = typeof data?.latitude === "number" && Number.isFinite(data.latitude) ? data.latitude : null;
    const lng = typeof data?.longitude === "number" && Number.isFinite(data.longitude) ? data.longitude : null;
    // 0,0 genellikle "konum yok" anlamına gelir
    return { takenAt, lat: lat === 0 && lng === 0 ? null : lat, lng: lat === 0 && lng === 0 ? null : lng };
  } catch {
    return { takenAt: null, lat: null, lng: null };
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Bazı tarayıcılar (ör. HEIC'i yalnızca <img> ile açabilen Safari) için yedek yol
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new MediaError("decode_failed");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sizeOf(src: ImageBitmap | HTMLImageElement) {
  return src instanceof HTMLImageElement ? { w: src.naturalWidth, h: src.naturalHeight } : { w: src.width, h: src.height };
}

function draw(src: CanvasImageSource, w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new MediaError("decode_failed");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, cw, ch);
  return canvas;
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob | null>((resolve) => c.toBlob(resolve, type, q));

async function encode(c: HTMLCanvasElement, preferWebp: boolean, q: number): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  if (preferWebp) {
    const b = await toBlob(c, "image/webp", q);
    // WebP kodlamayı desteklemeyen tarayıcı PNG döndürür
    if (b && b.type === "image/webp") return { blob: b, ext: "webp" };
  }
  const j = await toBlob(c, "image/jpeg", q + 0.03);
  if (!j) throw new MediaError("decode_failed");
  return { blob: j, ext: "jpg" };
}

export async function processImage(file: File): Promise<ProcessedImage> {
  if (!isAcceptedImage(file)) throw new MediaError("not_image");
  if (file.size > MEDIA_LIMITS.inputBytes) throw new MediaError("too_large");
  const [exif, src] = await Promise.all([readExif(file), decode(file)]);
  const { w, h } = sizeOf(src);
  if (!w || !h) throw new MediaError("decode_failed");

  const mainCanvas = draw(src, w, h, MEDIA_LIMITS.mainPx);
  if ("close" in src) src.close();
  const main = await encode(mainCanvas, true, 0.82);
  const thumbCanvas = draw(mainCanvas, mainCanvas.width, mainCanvas.height, MEDIA_LIMITS.thumbPx);
  // Büyük ve küçük görsel aynı biçimde (yol uzantıları eşleşsin)
  const thumb = await encode(thumbCanvas, main.ext === "webp", 0.78);
  return {
    main: main.blob, thumb: thumb.blob, ext: main.ext,
    width: mainCanvas.width, height: mainCanvas.height, ...exif,
  };
}
