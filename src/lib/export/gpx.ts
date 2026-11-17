import { coord, escapeXml as x, isoTime, type ExportDoc, type ExportPoint } from "./xml";

/** GPX 1.1 belgesi (UTF-8). Kaydedilen iz <trk>, planlanan rota <rte>, duraklar/notlar <wpt>. */
export function buildGpx(doc: ExportDoc, creator = "ROVIA"): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(
    `<gpx version="1.1" creator="${x(creator)}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">`,
  );
  out.push("  <metadata>");
  out.push(`    <name>${x(doc.name)}</name>`);
  if (doc.description) out.push(`    <desc>${x(doc.description)}</desc>`);
  if (doc.time) out.push(`    <time>${isoTime(doc.time)}</time>`);
  out.push("  </metadata>");

  // Şema sırası: wpt → rte → trk
  for (const w of doc.waypoints) {
    out.push(`  <wpt lat="${coord(w.lat)}" lon="${coord(w.lng)}">`);
    if (w.time) out.push(`    <time>${isoTime(w.time)}</time>`);
    out.push(`    <name>${x(w.name)}</name>`);
    if (w.description) out.push(`    <desc>${x(w.description)}</desc>`);
    if (w.type) out.push(`    <type>${x(w.type)}</type>`);
    out.push("  </wpt>");
  }
  const pt = (tag: string, p: ExportPoint, indent: string) => {
    const ele = p.ele !== null && p.ele !== undefined && Number.isFinite(p.ele) ? `<ele>${Math.round(p.ele * 10) / 10}</ele>` : "";
    const time = p.time !== null && p.time !== undefined ? `<time>${isoTime(p.time)}</time>` : "";
    return ele || time
      ? `${indent}<${tag} lat="${coord(p.lat)}" lon="${coord(p.lng)}">${ele}${time}</${tag}>`
      : `${indent}<${tag} lat="${coord(p.lat)}" lon="${coord(p.lng)}"/>`;
  };
  if (doc.route && doc.route.points.length > 1) {
    out.push("  <rte>");
    out.push(`    <name>${x(doc.route.name)}</name>`);
    for (const p of doc.route.points) out.push(pt("rtept", p, "    "));
    out.push("  </rte>");
  }
  const segs = doc.track?.segments.filter((s) => s.length > 0) ?? [];
  if (doc.track && segs.length) {
    out.push("  <trk>");
    out.push(`    <name>${x(doc.track.name)}</name>`);
    for (const s of segs) {
      out.push("    <trkseg>");
      for (const p of s) out.push(pt("trkpt", p, "      "));
      out.push("    </trkseg>");
    }
    out.push("  </trk>");
  }
  out.push("</gpx>");
  return out.join("\n") + "\n";
}
