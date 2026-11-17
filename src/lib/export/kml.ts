import { coord, escapeXml as x, isoTime, type ExportDoc, type ExportPoint } from "./xml";

/** KML 2.2 belgesi (UTF-8). İz bölümleri MultiGeometry/LineString, rota LineString, duraklar Point. */
export function buildKml(doc: ExportDoc): string {
  const out: string[] = [];
  const line = (pts: ExportPoint[], indent: string) => {
    const hasEle = pts.some((p) => p.ele !== null && p.ele !== undefined);
    const coords = pts.map((p) => `${coord(p.lng)},${coord(p.lat)}${hasEle ? `,${Math.round((p.ele ?? 0) * 10) / 10}` : ""}`).join(" ");
    return [
      `${indent}<LineString>`,
      `${indent}  <tessellate>1</tessellate>`,
      ...(hasEle ? [`${indent}  <altitudeMode>clampToGround</altitudeMode>`] : []),
      `${indent}  <coordinates>${coords}</coordinates>`,
      `${indent}</LineString>`,
    ].join("\n");
  };
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
  out.push("  <Document>");
  out.push(`    <name>${x(doc.name)}</name>`);
  if (doc.description) out.push(`    <description>${x(doc.description)}</description>`);
  out.push('    <Style id="track"><LineStyle><color>ff2d91e8</color><width>4</width></LineStyle></Style>');
  out.push('    <Style id="route"><LineStyle><color>ff9b877b</color><width>3</width></LineStyle></Style>');

  const segs = doc.track?.segments.filter((s) => s.length > 1) ?? [];
  if (doc.track && segs.length) {
    const times = segs.flat().map((p) => p.time).filter((t): t is string | number => t !== null && t !== undefined);
    out.push("    <Placemark>");
    out.push(`      <name>${x(doc.track.name)}</name>`);
    if (times.length > 1) out.push(`      <TimeSpan><begin>${isoTime(times[0])}</begin><end>${isoTime(times[times.length - 1])}</end></TimeSpan>`);
    out.push("      <styleUrl>#track</styleUrl>");
    out.push("      <MultiGeometry>");
    for (const s of segs) out.push(line(s, "        "));
    out.push("      </MultiGeometry>");
    out.push("    </Placemark>");
  }
  if (doc.route && doc.route.points.length > 1) {
    out.push("    <Placemark>");
    out.push(`      <name>${x(doc.route.name)}</name>`);
    out.push("      <styleUrl>#route</styleUrl>");
    out.push(line(doc.route.points, "      "));
    out.push("    </Placemark>");
  }
  if (doc.waypoints.length) {
    out.push("    <Folder>");
    out.push("      <name>Noktalar</name>");
    for (const w of doc.waypoints) {
      out.push("      <Placemark>");
      out.push(`        <name>${x(w.name)}</name>`);
      if (w.description) out.push(`        <description>${x(w.description)}</description>`);
      if (w.time) out.push(`        <TimeStamp><when>${isoTime(w.time)}</when></TimeStamp>`);
      out.push(`        <Point><coordinates>${coord(w.lng)},${coord(w.lat)}</coordinates></Point>`);
      out.push("      </Placemark>");
    }
    out.push("    </Folder>");
  }
  out.push("  </Document>");
  out.push("</kml>");
  return out.join("\n") + "\n";
}
