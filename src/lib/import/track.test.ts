import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseTrackFile, parseTrackText, trackStats, TRACK_LIMITS, TrackImportError } from "./track";
import { buildImportPayload } from "./track-plan";
import { decodeTrack } from "@/lib/gps/track";
import { decodePolyline } from "@/lib/geo";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof TrackImportError ? e.code : "other";
  }
  return null;
};

const gpx = (body: string) => `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;
const pts = (n: number, timed = true) =>
  Array.from({ length: n }, (_, i) =>
    `<trkpt lat="${38.6 + i * 0.001}" lon="${34.8 + i * 0.001}"><ele>${1000 + i}</ele>${timed ? `<time>2026-05-12T08:${String(i).padStart(2, "0")}:00Z</time>` : ""}</trkpt>`).join("");

describe("parseTrackText — GPX", () => {
  it("trk/trkseg/trkpt, metadata adı, kök wpt; geçersiz koordinat atlanır", () => {
    const r = parseTrackText("gpx", gpx(`<metadata><name>Göreme &amp; Uçhisar</name></metadata>
      <wpt lat="38.65" lon="34.83"><name><![CDATA[Kafe <1>]]></name><desc>Çay</desc></wpt>
      <trk><name>İz</name><trkseg>${pts(5)}<trkpt lat="95" lon="1"/></trkseg><trkseg>${pts(2)}</trkseg></trk>`));
    expect(r.name).toBe("Göreme & Uçhisar");
    expect(r.segments.map((s) => s.length)).toEqual([5, 2]);
    expect(r.segments[0][0]).toEqual({ lat: 38.6, lng: 34.8, ele: 1000, t: Date.parse("2026-05-12T08:00:00Z") });
    expect(r.waypoints).toEqual([{ name: "Kafe <1>", lat: 38.65, lng: 34.83, description: "Çay" }]);
  });
  it("iz yoksa rte/rtept", () => {
    const r = parseTrackText("gpx", gpx(`<rte><rtept lat="39" lon="32"/><rtept lat="39.1" lon="32.1"/></rte>`));
    expect(r.segments).toHaveLength(1);
  });
  it("DOCTYPE/ENTITY reddedilir (XXE)", () => {
    expect(code(() => parseTrackText("gpx", `<?xml version="1.0"?><!DOCTYPE gpx [<!ENTITY x SYSTEM "file:///etc/passwd">]><gpx>&x;</gpx>`))).toBe("unsafe");
  });
  it("kök öğe yoksa geçersiz, nokta yoksa boş", () => {
    expect(code(() => parseTrackText("gpx", "<html></html>"))).toBe("invalid");
    expect(code(() => parseTrackText("gpx", gpx("<trk><trkseg></trkseg></trk>")))).toBe("empty");
  });
  it("nokta sınırı", () => {
    const many = `<trkpt lat="1" lon="1"/>`.repeat(TRACK_LIMITS.points + 1);
    expect(code(() => parseTrackText("gpx", gpx(`<trk><trkseg>${many}</trkseg></trk>`)))).toBe("too_many_points");
  });
  it("boyut ve tür", () => {
    expect(code(() => parseTrackFile("a.gpx", new Uint8Array(TRACK_LIMITS.fileBytes + 1)))).toBe("too_large");
    expect(code(() => parseTrackFile("a.txt", strToU8("x")))).toBe("unsupported");
  });
});

describe("parseTrackText — KML", () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>Rota</name>
    <Placemark><name>Çizgi</name><MultiGeometry><LineString><coordinates>32,39,0 32.1,39.1,0</coordinates></LineString><LineString><coordinates>
      32.2,39.2 32.3,39.3</coordinates></LineString></MultiGeometry></Placemark>
    <Placemark><gx:Track><when>2026-05-12T08:00:00Z</when><when>2026-05-12T08:10:00Z</when><gx:coord>33 40 900</gx:coord><gx:coord>33.01 40.01 905</gx:coord></gx:Track></Placemark>
    <Folder><name>Yerler</name><Placemark><name>Nokta</name><description><![CDATA[<b>kalın</b>]]></description><Point><coordinates>32.5,39.5,0</coordinates></Point></Placemark></Folder>
    </Document></kml>`;
  it("LineString, MultiGeometry, gx:Track, Point", () => {
    const r = parseTrackText("kml", kml);
    expect(r.name).toBe("Rota");
    expect(r.segments.map((s) => s.length)).toEqual([2, 2, 2]);
    expect(r.segments[2][1]).toEqual({ lat: 40.01, lng: 33.01, ele: 905, t: Date.parse("2026-05-12T08:10:00Z") });
    expect(r.waypoints).toEqual([{ name: "Nokta", lat: 39.5, lng: 32.5, description: "kalın" }]);
  });
  it("KMZ: kökteki ilk .kml", () => {
    const zip = zipSync({ "doc.kml": strToU8(kml), "files/x.png": new Uint8Array(3) });
    expect(parseTrackFile("a.kmz", zip).segments).toHaveLength(3);
    expect(code(() => parseTrackFile("a.kmz", strToU8("not a zip")))).toBe("invalid");
  });
});

describe("trackStats", () => {
  it("mesafe, süre, hareket; azalan zaman → zamansız", () => {
    const r = parseTrackText("gpx", gpx(`<trk><trkseg>${pts(10)}</trkseg></trk>`));
    const s = trackStats(r.segments);
    expect(s.hasTime).toBe(true);
    expect(s.elapsedS).toBe(540);
    expect(s.movingS).toBe(540);
    expect(s.distanceM).toBeGreaterThan(1200);
    const u = trackStats([[{ lat: 1, lng: 1, t: 2000 }, { lat: 1.001, lng: 1, t: 1000 }]]);
    expect(u.hasTime).toBe(false);
    expect(trackStats(parseTrackText("gpx", gpx(`<trk><trkseg>${pts(3, false)}</trkseg></trk>`)).segments).hasTime).toBe(false);
  });
});

describe("buildImportPayload", () => {
  const r = parseTrackText("gpx", gpx(`
    <wpt lat="38.6" lon="34.8"><name>Göreme</name></wpt>
    <wpt lat="38.605" lon="34.805"><name>Orta</name></wpt>
    <wpt lat="41" lon="29"><name>Uzak</name></wpt>
    <trk><trkseg>${pts(11)}</trkseg></trk>`));
  it("kayıt modu: iz, zamanlar, duraklar (uzak nokta hariç, uç ad yol noktasından)", () => {
    const p = buildImportPayload(r, "recording");
    expect(decodeTrack(p.polyline)[0].length).toBeGreaterThan(1);
    expect(p.startedAt).toBe("2026-05-12T08:00:00.000Z");
    expect(p.endedAt).toBe("2026-05-12T08:10:00.000Z");
    expect(p.pointCount).toBe(11);
    expect(p.stops.map((s) => s.name)).toEqual(["Göreme", "Orta", null]);
    expect(p.legs).toBeNull();
  });
  it("rota modu: tek çizgi ve durak sayısı − 1 bacak", () => {
    const p = buildImportPayload(r, "route");
    expect(p.polyline).not.toContain(" ");
    expect(decodePolyline(p.polyline).length).toBeGreaterThan(1);
    expect(p.legs).toHaveLength(2);
    const sum = p.legs!.reduce((n, l) => n + l.d, 0);
    expect(Math.abs(sum - p.distanceM)).toBeLessThan(5);
  });
  it("zamansız iz kayıt olamaz", () => {
    const u = parseTrackText("gpx", gpx(`<trk><trkseg>${pts(3, false)}</trkseg></trk>`));
    expect(() => buildImportPayload(u, "recording")).toThrow("NO_TIME");
  });
});
