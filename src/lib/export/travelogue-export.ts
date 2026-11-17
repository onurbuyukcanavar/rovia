import "server-only";
import { getTravelogue } from "@/lib/queries/travelogue";
import { buildBook, imageNeeds, IMAGE_PX } from "@/lib/travelogue/pdf/model";
import { decodeTrack } from "@/lib/gps/track";
import { renderTravelogueHtml, type HtmlImage } from "./travelogue-html";
import type { ExportDoc } from "./xml";
import { t } from "@/i18n";

/** Gömülü görsellerin toplam üst sınırı; aşılınca küçük görsel, o da sığmazsa atlanır. */
export const HTML_IMAGE_BUDGET = 40 * 1024 * 1024;
const PER_IMAGE_MAX = 15 * 1024 * 1024;
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;
const CONCURRENCY = 4;

async function fetchImage(url: string, maxBytes: number): Promise<{ type: string; bytes: Buffer } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!IMAGE_TYPES.test(type)) return null;
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : { type, bytes };
  } catch {
    return null;
  }
}

export async function buildTravelogueHtml(id: string): Promise<{ title: string; html: string } | null> {
  const tv = await getTravelogue(id);
  if (!tv) return null;
  const model = buildBook(tv);

  // Aynı görsel bir kez: en büyük istenen boyut
  const wanted = new Map<string, number>();
  for (const n of imageNeeds(model)) wanted.set(n.mediaId, Math.max(wanted.get(n.mediaId) ?? 0, n.maxPx));
  const jobs = [...wanted.entries()].map(([mediaId, maxPx]) => {
    const m = model.media.get(mediaId)!;
    // Izgara görselleri için küçük sürüm yeterli
    const primary = maxPx >= IMAGE_PX.full ? m.url : (m.thumbUrl ?? m.url);
    return { mediaId, primary, thumb: m.thumbUrl, width: m.width, height: m.height };
  });

  const images = new Map<string, HtmlImage>();
  let used = 0;
  let skipped = 0;
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      let got = job.primary ? await fetchImage(job.primary, Math.min(PER_IMAGE_MAX, HTML_IMAGE_BUDGET - used)) : null;
      if (!got && job.thumb && job.thumb !== job.primary) got = await fetchImage(job.thumb, HTML_IMAGE_BUDGET - used);
      // base64 ≈ 4/3 boyut
      const size = got ? Math.ceil(got.bytes.byteLength / 3) * 4 : 0;
      if (!got || used + size > HTML_IMAGE_BUDGET) {
        skipped += 1;
        continue;
      }
      used += size;
      images.set(job.mediaId, { src: `data:${got.type};base64,${got.bytes.toString("base64")}`, width: job.width, height: job.height });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return { title: tv.title, html: renderTravelogueHtml(model, images, { skipped, generatedAt: new Date() }) };
}

/** Seyahatname yazılarının konumları (+ bağlı yolculuğun izi) GPX/KML için. */
export async function loadTravelogueExport(id: string): Promise<ExportDoc | null> {
  const tv = await getTravelogue(id);
  if (!tv) return null;
  const model = buildBook(tv);
  const segments = decodeTrack(tv.trip?.polyline).filter((s) => s.length > 1);
  return {
    name: tv.title,
    description: tv.subtitle,
    time: tv.trip?.startedAt ?? tv.createdAt,
    track: segments.length ? { name: tv.trip?.title ?? t.tools.export.trackName, segments } : null,
    route: null,
    waypoints: model.entries
      .filter((be) => be.entry.lat !== null && be.entry.lng !== null)
      .map((be) => ({
        name: `${be.number}. ${be.title}`,
        lat: be.entry.lat!,
        lng: be.entry.lng!,
        time: be.entry.visitedAt,
        type: t.tools.export.entryType,
        description: [be.entry.locationName, be.entry.contentText?.replace(/\s+/g, " ").trim().slice(0, 300)].filter(Boolean).join(" — ") || null,
      })),
  };
}
