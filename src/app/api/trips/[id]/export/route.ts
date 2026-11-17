import type { NextRequest } from "next/server";
import { buildGpx } from "@/lib/export/gpx";
import { buildKml } from "@/lib/export/kml";
import { exportGuard } from "@/lib/export/guard";
import { download, jsonError } from "@/lib/export/response";
import { loadTripExport } from "@/lib/export/trip-export";
import { t } from "@/i18n";

/** GET /api/trips/:id/export?format=gpx|kml — yolculuğun izi/rotası, durakları, notları ve seyahatname konumları. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") ?? "gpx";
  if (format !== "gpx" && format !== "kml") return jsonError(400, t.tools.export.errors.format);
  try {
    const denied = await exportGuard(id);
    if (denied) return denied;
    const doc = await loadTripExport(id);
    if (!doc) return jsonError(404, t.tools.export.errors.notFound);
    return download(format === "gpx" ? buildGpx(doc) : buildKml(doc), doc.name, format, "yolculuk");
  } catch (e) {
    console.error("[rovia] trip export:", e instanceof Error ? e.message : e);
    return jsonError(500, t.common.unexpectedError);
  }
}
