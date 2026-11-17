import type { NextRequest } from "next/server";
import { buildGpx } from "@/lib/export/gpx";
import { buildKml } from "@/lib/export/kml";
import { exportGuard } from "@/lib/export/guard";
import { download, jsonError } from "@/lib/export/response";
import { buildTravelogueHtml, loadTravelogueExport } from "@/lib/export/travelogue-export";
import { t } from "@/i18n";

/** GET /api/travelogues/:id/export?format=html|gpx|kml — tek dosyalık HTML kitap ya da yazı konumları. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "html";
  if (format !== "html" && format !== "gpx" && format !== "kml") return jsonError(400, t.tools.export.errors.format);
  try {
    const denied = await exportGuard(id);
    if (denied) return denied;
    if (format === "html") {
      const out = await buildTravelogueHtml(id);
      if (!out) return jsonError(404, t.tools.export.errors.notFound);
      return download(out.html, out.title, "html", "seyahatname");
    }
    const doc = await loadTravelogueExport(id);
    if (!doc) return jsonError(404, t.tools.export.errors.notFound);
    return download(format === "gpx" ? buildGpx(doc) : buildKml(doc), doc.name, format, "seyahatname");
  } catch (e) {
    console.error("[rovia] travelogue export:", e instanceof Error ? e.message : e);
    return jsonError(500, t.common.unexpectedError);
  }
}
