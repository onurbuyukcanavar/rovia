import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { buildGpx } from "./gpx";
import { buildKml } from "./kml";
import { escapeXml, type ExportDoc } from "./xml";
import { parseTrackFile, trackStats } from "@/lib/import/track";
import { parseGpx, parseKml } from "@/lib/import/parsers";

const t0 = Date.parse("2026-05-12T08:00:00Z");
const doc: ExportDoc = {
  name: `Kapadokya <"Üç" Gün> & 'balon'`,
  description: "Göreme → Uçhisar",
  time: "2026-05-12T08:00:00Z",
  track: {
    name: "Kaydedilen iz",
    segments: [
      [0, 1, 2].map((i) => ({ lat: 38.643 + i * 0.001, lng: 34.828 + i * 0.001, ele: 1000 + i, time: new Date(t0 + i * 60_000).toISOString() })),
      [3, 4].map((i) => ({ lat: 38.643 + i * 0.001, lng: 34.828 + i * 0.001, ele: null, time: t0 + i * 60_000 })),
    ],
  },
  route: null,
  waypoints: [
    { name: "Peri Bacaları & <Paşabağ>", lat: 38.67, lng: 34.85, description: "Not: \u0001kontrol\u0007 karakteri", type: "Not", time: "2026-05-12T09:00:00Z" },
  ],
};

describe("escapeXml", () => {
  it("özel karakterleri kaçışlar, XML'de geçersiz karakterleri atar", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
    expect(escapeXml("a\u0000b\u001Fc\tç")).toBe("abc\tç");
    expect(escapeXml("x\uD800y😀")).toBe("xy😀");
  });
});

describe("buildGpx", () => {
  const gpx = buildGpx(doc);
  it("GPX 1.1 yapısı, kaçış ve sıra (wpt → trk)", () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1"')).toBe(true);
    expect(gpx).toContain("<name>Kapadokya &lt;&quot;Üç&quot; Gün&gt; &amp; &apos;balon&apos;</name>");
    expect(gpx).not.toContain("\u0001");
    expect(gpx.indexOf("<wpt")).toBeLessThan(gpx.indexOf("<trk>"));
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx).toContain('<trkpt lat="38.643" lon="34.828"><ele>1000</ele><time>2026-05-12T08:00:00Z</time></trkpt>');
    expect(gpx).toContain('<trkpt lat="38.646" lon="34.831"><time>2026-05-12T08:03:00Z</time></trkpt>');
    expect(gpx.trim().endsWith("</gpx>")).toBe(true);
  });
  it("içe aktarma ayrıştırıcısıyla gidiş-dönüş", () => {
    const back = parseTrackFile("x.gpx", strToU8(gpx));
    expect(back.name).toBe(doc.name);
    expect(back.segments).toHaveLength(2);
    expect(back.segments[0][0]).toEqual({ lat: 38.643, lng: 34.828, ele: 1000, t: t0 });
    expect(back.waypoints).toEqual([{ name: "Peri Bacaları & <Paşabağ>", lat: 38.67, lng: 34.85, description: "Not: kontrol karakteri" }]);
    const s = trackStats(back.segments);
    expect(s.hasTime).toBe(true);
    expect(s.elapsedS).toBe(240);
    // Favori içe aktarıcısı da yol noktalarını okur
    expect(parseGpx("x.gpx", gpx).places[0].name).toBe("Peri Bacaları & <Paşabağ>");
  });
  it("planlı rota <rte> olarak", () => {
    const g = buildGpx({ name: "Plan", track: null, route: { name: "Rota", points: [{ lat: 39, lng: 32 }, { lat: 39.1, lng: 32.1 }] }, waypoints: [] });
    expect(g).toContain('<rtept lat="39" lon="32"/>');
    expect(g).not.toContain("<trk>");
    expect(parseTrackFile("p.gpx", strToU8(g)).segments).toHaveLength(1);
  });
});

describe("buildKml", () => {
  const kml = buildKml(doc);
  it("KML 2.2 yapısı", () => {
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain("<MultiGeometry>");
    expect(kml).toContain("<TimeSpan><begin>2026-05-12T08:00:00Z</begin><end>2026-05-12T08:04:00Z</end></TimeSpan>");
    expect(kml).toContain("<coordinates>34.828,38.643,1000 ");
    expect(kml).toContain("<Point><coordinates>34.85,38.67</coordinates></Point>");
  });
  it("gidiş-dönüş", () => {
    const back = parseTrackFile("x.kml", strToU8(kml));
    expect(back.name).toBe(doc.name);
    expect(back.segments.map((s) => s.length)).toEqual([3, 2]);
    expect(back.waypoints[0].name).toBe("Peri Bacaları & <Paşabağ>");
    expect(parseKml("x.kml", kml).places[0].lat).toBe(38.67);
  });
});
