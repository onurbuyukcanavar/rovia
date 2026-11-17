import "server-only";
import { slugify } from "@/lib/travelogue/pdf/model";

export const MIME = {
  gpx: "application/gpx+xml; charset=utf-8",
  kml: "application/vnd.google-earth.kml+xml; charset=utf-8",
  html: "text/html; charset=utf-8",
} as const;

/** İndirme yanıtı: ASCII dosya adı (Türkçe karakterler sadeleştirilir) + RFC 5987 UTF-8 adı. */
export function download(body: string, title: string, format: keyof typeof MIME, fallback = "rovia"): Response {
  const name = `${slugify(title, fallback)}.${format}`;
  return new Response(body, {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const jsonError = (status: number, message: string) =>
  Response.json({ error: { message } }, { status, headers: { "Cache-Control": "private, no-store" } });
