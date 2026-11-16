import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { coordsFromGoogleUrl, isGoogleMapsHost, nameFromGoogleUrl } from "./google-url";
import { ImportError, LIMITS, listTypeFromName, parseCsv, parseImportFile } from "./parsers";

const u8 = (s: string) => strToU8(s);

describe("Google Maps bağlantıları", () => {
  it("yerin kendi koordinatını (!3d!4d) görünüm merkezine (@) tercih eder", () => {
    const url = "https://www.google.com/maps/place/Topkap%C4%B1+Saray%C4%B1/@41.0,28.9,17z/data=!3m1!4b1!4m6!3m5!1s0x14cab9be92011c27:0x236e6f6aabe8ea81!8m2!3d41.0115195!4d28.9833789";
    expect(coordsFromGoogleUrl(url)).toEqual({ lat: 41.0115195, lng: 28.9833789 });
    expect(nameFromGoogleUrl(url)).toBe("Topkapı Sarayı");
  });

  it("sorgu, arama ve görünüm biçimleri", () => {
    expect(coordsFromGoogleUrl("https://maps.google.com/?q=38.6431,34.8289")).toEqual({ lat: 38.6431, lng: 34.8289 });
    expect(coordsFromGoogleUrl("https://www.google.com/maps/search/40.1885,+29.0610")).toEqual({ lat: 40.1885, lng: 29.061 });
    expect(coordsFromGoogleUrl("https://www.google.com/maps/@39.92,32.85,14z")).toEqual({ lat: 39.92, lng: 32.85 });
    expect(coordsFromGoogleUrl("https://www.google.com/maps/place/41.0369,28.9850")).toEqual({ lat: 41.0369, lng: 28.985 });
    expect(nameFromGoogleUrl("https://www.google.com/maps/place/41.0369,28.9850")).toBeNull();
  });

  it("koordinatsız bağlantı ve geçersiz değerler", () => {
    expect(coordsFromGoogleUrl("https://www.google.com/maps/place/Kad%C4%B1k%C3%B6y+%C3%87ar%C5%9F%C4%B1/data=!4m2!3m1!1s0x14cab8:0x5d")).toBeNull();
    expect(nameFromGoogleUrl("https://www.google.com/maps/place/Kad%C4%B1k%C3%B6y+%C3%87ar%C5%9F%C4%B1/data=!4m2")).toBe("Kadıköy Çarşı");
    expect(coordsFromGoogleUrl("https://maps.google.com/?q=0,0")).toBeNull();
    expect(coordsFromGoogleUrl("https://maps.google.com/?q=95.1,30")).toBeNull();
    expect(coordsFromGoogleUrl(null)).toBeNull();
  });

  it("yalnızca Google Maps alan adlarına izin verir (kısa bağlantı çözümlemesi)", () => {
    const ok = ["https://maps.app.goo.gl/AbC123", "https://goo.gl/maps/xyz", "https://www.google.com/maps/place/x", "https://www.google.com.tr/maps/@1,2,3z", "https://maps.google.com/?q=1,2"];
    const bad = ["https://evil.com/maps", "https://goo.gl/other", "https://www.google.com/search?q=x", "https://maps.app.goo.gl.evil.com/x", "file:///etc/passwd", "https://169.254.169.254/maps"];
    for (const u of ok) expect(isGoogleMapsHost(new URL(u)), u).toBe(true);
    for (const u of bad) expect(isGoogleMapsHost(new URL(u)), u).toBe(false);
  });
});

describe("CSV", () => {
  it("tırnak, kaçış, alan içi satır sonu ve noktalı virgül ayracı", () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n"çok\nsatır",z\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["çok\nsatır", "z"]]);
    expect(parseCsv("ad;enlem;boylam\r\nX;41,0;29,0\r\n")).toEqual([["ad", "enlem", "boylam"], ["X", "41,0", "29,0"]]);
  });

  it("Google Takeout liste CSV'si: bağlantıdan koordinat ve ad; liste türü dosya adından", () => {
    const csv = "﻿Title,Note,URL,Comment\n" +
      'Topkapı Sarayı,Sabah erken git,"https://www.google.com/maps/place/Topkap%C4%B1/data=!4m2!3m1!1s0x1:0x2!8m2!3d41.0115!4d28.9834",\n' +
      ',,"https://www.google.com/maps/place/Kad%C4%B1k%C3%B6y+%C3%87ar%C5%9F%C4%B1/data=!4m2!3m1!1s0x3:0x4",\n' +
      ",,,\n";
    const [f] = parseImportFile("Takeout/Saved/Want to go.csv", u8(csv));
    expect(f.source).toBe("google_takeout");
    expect(f.places).toEqual([
      expect.objectContaining({ name: "Topkapı Sarayı", lat: 41.0115, lng: 28.9834, notes: "Sabah erken git", listName: "Want to go", listType: "want_to_go" }),
      expect.objectContaining({ name: "Kadıköy Çarşı", lat: null, lng: null }),
    ]);
  });

  it("genel CSV: Türkçe başlıklar ve ondalık virgül", () => {
    const [f] = parseImportFile("yerlerim.csv", u8("Ad;Enlem;Boylam;Not\nSafranbolu Çarşı;41,2440;32,6920;Lokum al\n"));
    expect(f.source).toBe("csv");
    expect(f.places[0]).toMatchObject({ name: "Safranbolu Çarşı", lat: 41.244, lng: 32.692, notes: "Lokum al", listType: "favorite" });
  });

  it("tanınmayan sütunlar: anlaşılır hata", () => {
    expect(() => parseImportFile("x.csv", u8("foo,bar\n1,2\n"))).toThrow(ImportError);
  });
});

describe("GeoJSON (Takeout Saved Places.json)", () => {
  it("yeni ve eski Takeout biçimleri; [0,0] bilinmeyen konum sayılır ve bağlantıdan çözülür", () => {
    const json = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [34.8289, 38.6431] },
          properties: { date: "2024-05-01", google_maps_url: "https://maps.google.com/?cid=111", location: { name: "Göreme", address: "Göreme, Nevşehir", country_code: "TR" }, Comment: "Balon turu" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] },
          properties: { "Google Maps URL": "https://www.google.com/maps/place/Uzung%C3%B6l/@40.6,40.2,15z/data=!3d40.6195!4d40.2895", location: { "Business Name": "Uzungöl", Address: "Trabzon" } } },
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { google_maps_url: "https://maps.google.com/?cid=333", location: { name: "Bilinmeyen" } } },
      ],
    });
    const [f] = parseImportFile("Takeout/Maps (your places)/Saved Places.json", u8(json));
    expect(f.source).toBe("google_takeout");
    expect(f.places).toEqual([
      expect.objectContaining({ name: "Göreme", lat: 38.6431, lng: 34.8289, notes: "Balon turu", address: "Göreme, Nevşehir", sourceRef: "https://maps.google.com/?cid=111" }),
      expect.objectContaining({ name: "Uzungöl", lat: 40.6195, lng: 40.2895 }),
      expect.objectContaining({ name: "Bilinmeyen", lat: null, lng: null }),
    ]);
  });

  it("bozuk JSON: anlaşılır hata", () => {
    expect(() => parseImportFile("Saved Places.json", u8("{not json"))).toThrow(ImportError);
  });
});

describe("KML / KMZ / GPX", () => {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Karadeniz Turu</name>
  <Folder><name>Yaylalar</name>
    <Placemark><name><![CDATA[Ayder Yaylası]]></name><description><![CDATA[<b>Kaplıca</b><br>var]]></description>
      <Point><coordinates>41.1050,40.9530,0</coordinates></Point></Placemark>
    <Placemark><name>Rota çizgisi</name><LineString><coordinates>41,40 42,41</coordinates></LineString></Placemark>
  </Folder>
  <Placemark><name>Sümela &amp; Manastırı &xxe;</name><Point><coordinates> 39.6589,40.6903 </coordinates></Point></Placemark>
</Document></kml>`;

  it("KML: yer işaretleri, klasör adı liste olur, HTML açıklama temizlenir, çizgiler atlanır, XXE işlenmez", () => {
    const [f] = parseImportFile("karadeniz.kml", u8(kml));
    expect(f.source).toBe("kml");
    expect(f.places).toHaveLength(2);
    expect(f.places[0]).toMatchObject({ name: "Ayder Yaylası", lat: 40.953, lng: 41.105, notes: "Kaplıca var", listName: "Yaylalar" });
    expect(f.places[1].name).toBe("Sümela & Manastırı &xxe;");
    expect(f.places[1]).toMatchObject({ lat: 40.6903, lng: 39.6589, listName: "Karadeniz Turu" });
  });

  it("KMZ (ZIP içinde doc.kml)", () => {
    const kmz = zipSync({ "doc.kml": u8(kml) });
    const files = parseImportFile("harita.kmz", kmz);
    expect(files.flatMap((x) => x.places)).toHaveLength(2);
  });

  it("GPX yol noktaları", () => {
    const gpx = `<gpx><wpt lat="41.0082" lon="28.9784"><name>Sultanahmet</name><desc>Cami</desc></wpt><wpt lat="x" lon="1"><name>bozuk</name></wpt><wpt lat="39.9" lon="32.8"/></gpx>`;
    const [f] = parseImportFile("noktalar.gpx", u8(gpx));
    expect(f.places).toEqual([expect.objectContaining({ name: "Sultanahmet", lat: 41.0082, lng: 28.9784, notes: "Cami" })]);
  });
});

describe("Google Takeout ZIP", () => {
  it("Saved/*.csv ve Saved Places.json bulunur; diğer dosyalar (yorumlar vb.) atlanır", () => {
    const zip = zipSync({
      "Takeout/Saved/Want to go.csv": u8("Title,Note,URL\nUzungöl,,https://maps.google.com/?q=40.6195,40.2895\n"),
      "Takeout/Saved/Favorite places.csv": u8("Title,Note,URL\nAnıtkabir,,https://maps.google.com/?q=39.925,32.837\n"),
      "Takeout/Maps (your places)/Saved Places.json": u8(JSON.stringify({ type: "FeatureCollection", features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [28.97, 41.0] }, properties: { location: { name: "Galata" } } }] })),
      "Takeout/Maps (your places)/Reviews.json": u8(JSON.stringify({ type: "FeatureCollection", features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: { location: { name: "Yorum yapılan yer" } } }] })),
      "Takeout/archive_browser.html": u8("<html></html>"),
    });
    const files = parseImportFile("takeout-20261116.zip", zip);
    const names = files.flatMap((f) => f.places.map((p) => `${p.name}:${p.listType}`)).sort();
    expect(names).toEqual(["Anıtkabir:favorite", "Galata:favorite", "Uzungöl:want_to_go"]);
    expect(files.every((f) => f.source === "google_takeout")).toBe(true);
  });

  it("boş arşiv, desteklenmeyen tür ve boyut sınırları", () => {
    expect(() => parseImportFile("bos.zip", zipSync({ "readme.txt": u8("x") }))).toThrow(/empty/);
    expect(() => parseImportFile("foto.jpg", u8("x"))).toThrow(/unsupported/);
    expect(() => parseImportFile("dev.kml", new Uint8Array(LIMITS.fileBytes + 1))).toThrow(/too_large/);
    expect(() => parseImportFile("bozuk.zip", u8("PK not a zip"))).toThrow(/invalid/);
  });

  it("liste türü dosya adından (Türkçe Takeout dahil)", () => {
    expect(listTypeFromName("Gitmek istediğim yerler.csv")).toBe("want_to_go");
    expect(listTypeFromName("Want to go.csv")).toBe("want_to_go");
    expect(listTypeFromName("Favori yerler.csv")).toBe("favorite");
  });
});
