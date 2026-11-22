import { describe, expect, it } from "vitest";
import {
  decodeGeohash, extractLinks, formatCoords, googleMapsUrl, parseCoordinatePair, parseGeoUri, parseSharedLocation, validPoint,
} from "./parse";

const pt = (lat: number, lng: number, extra: Record<string, unknown> = {}) => expect.objectContaining({ kind: "point", lat, lng, ...extra });

describe("WhatsApp mesajları", () => {
  it("anlık/sabit konum: maps.google.com/maps?q=…&z=17&hl=tr", () => {
    expect(parseSharedLocation("https://maps.google.com/maps?q=41.0082%2C28.9784&z=17&hl=tr")).toEqual(pt(41.0082, 28.9784, { source: "google", label: null }));
    expect(parseSharedLocation("https://maps.google.com/maps?q=41.0082,28.9784&z=17&hl=tr")).toEqual(pt(41.0082, 28.9784));
  });

  it("Türkçe metin içinde bağlantı (sondaki noktalama dahil değil)", () => {
    const msg = "Selam! Akşam burada buluşalım 👉 https://maps.google.com/?q=38.643100,34.828900. Geç kalma 😅";
    expect(parseSharedLocation(msg)).toEqual(pt(38.6431, 34.8289));
    expect(parseSharedLocation("Konum: (https://maps.google.com/?q=40.1885,29.061)")).toEqual(pt(40.1885, 29.061));
  });

  it("kısa bağlantılı paylaşım: ad + maps.app.goo.gl → sunucuda çözülecek", () => {
    const msg = "Galata Kulesi\nBereketzade, 34421 Beyoğlu/İstanbul\nhttps://maps.app.goo.gl/u9xSWmKH3YhkSMRd8";
    expect(parseSharedLocation(msg)).toEqual({ kind: "resolve", url: "https://maps.app.goo.gl/u9xSWmKH3YhkSMRd8", source: "google" });
  });

  it("şemasız kısa bağlantı ve http kısa bağlantı https'e yükseltilir", () => {
    expect(parseSharedLocation("bak maps.app.goo.gl/AbCd123 burası")).toEqual({ kind: "resolve", url: "https://maps.app.goo.gl/AbCd123", source: "google" });
    expect(parseSharedLocation("http://goo.gl/maps/XyZ987")).toEqual({ kind: "resolve", url: "https://goo.gl/maps/XyZ987", source: "google" });
  });

  it("koordinatlı bağlantı kısa bağlantıdan önce gelir", () => {
    const msg = "https://maps.app.goo.gl/abc ya da https://maps.google.com/?q=41.1,29.1";
    expect(parseSharedLocation(msg)).toEqual(pt(41.1, 29.1));
  });

  it("görünmez yön karakterleri temizlenir", () => {
    expect(parseSharedLocation("‎https://maps.google.com/?q=41.5,29.5‏")).toEqual(pt(41.5, 29.5));
  });
});

describe("Google Haritalar", () => {
  it("api=1 arama ve yol tarifi", () => {
    expect(parseSharedLocation("https://www.google.com/maps/search/?api=1&query=36.5489,29.1156")).toEqual(pt(36.5489, 29.1156));
    expect(parseSharedLocation("https://www.google.com/maps/dir/?api=1&destination=37.0346%2C27.4305&travelmode=driving")).toEqual(pt(37.0346, 27.4305));
    expect(parseSharedLocation("https://www.google.com/maps/dir/?api=1&destination=%C3%96l%C3%BCdeniz")).toEqual({ kind: "query", query: "Ölüdeniz", source: "google" });
  });

  it("google.com/maps?q= ve google.com.tr", () => {
    expect(parseSharedLocation("https://www.google.com/maps?q=39.92077,32.85411")).toEqual(pt(39.92077, 32.85411));
    expect(parseSharedLocation("https://www.google.com.tr/maps?q=39.92077,32.85411")).toEqual(pt(39.92077, 32.85411));
  });

  it("place + @ + !3d!4d: yerin kendi koordinatı görünüm merkezine tercih edilir", () => {
    const url = "https://www.google.com/maps/place/Topkap%C4%B1+Saray%C4%B1/@41.0,28.9,17z/data=!3m1!4b1!4m6!3m5!1s0x14cab9be92011c27:0x236e6f6aabe8ea81!8m2!3d41.0115195!4d28.9833789!16zL20vMDFzZHg";
    expect(parseSharedLocation(url)).toEqual(pt(41.01152, 28.983379, { label: "Topkapı Sarayı", approximate: false }));
  });

  it("yalnızca @ görünüm merkezi → yaklaşık; place adı korunur", () => {
    expect(parseSharedLocation("https://www.google.com/maps/place/Uzung%C3%B6l/@40.6195,40.2895,15z")).toEqual(pt(40.6195, 40.2895, { label: "Uzungöl", approximate: true }));
    expect(parseSharedLocation("https://www.google.com/maps/@39.92,32.85,14z")).toEqual(pt(39.92, 32.85, { label: null, approximate: true }));
  });

  it("ll=, daddr=, q=loc:, 'Ad@lat,lng', q=lat,lng (Ad)", () => {
    expect(parseSharedLocation("https://maps.google.com/maps?ll=37.7749,29.0875&z=12")).toEqual(pt(37.7749, 29.0875));
    expect(parseSharedLocation("https://maps.google.com/maps?saddr=41,29&daddr=38.4192,27.1287")).toEqual(pt(38.4192, 27.1287));
    expect(parseSharedLocation("https://maps.google.com/maps?daddr=38.4,27.1+to:37.0,27.4")).toEqual(pt(37, 27.4));
    expect(parseSharedLocation("https://maps.google.com/?q=loc:36.8841,30.7056")).toEqual(pt(36.8841, 30.7056));
    expect(parseSharedLocation("https://maps.google.com/?q=Kalei%C3%A7i@36.8841,30.7056")).toEqual(pt(36.8841, 30.7056, { label: "Kaleiçi" }));
    expect(parseSharedLocation("https://maps.google.com/?q=36.8841,30.7056+(Kalei%C3%A7i)")).toEqual(pt(36.8841, 30.7056, { label: "Kaleiçi" }));
  });

  it("yol: /maps/search/<koordinat>, /maps/place/<koordinat>, /maps/dir/A/B", () => {
    expect(parseSharedLocation("https://www.google.com/maps/search/40.1885,+29.0610")).toEqual(pt(40.1885, 29.061));
    expect(parseSharedLocation("https://www.google.com/maps/place/41.0369,28.9850")).toEqual(pt(41.0369, 28.985));
    expect(parseSharedLocation("https://www.google.com/maps/dir/41.0,29.0/38.6431,34.8289/@39,31,7z")).toEqual(pt(38.6431, 34.8289));
  });

  it("yalnızca yer adı → sorgu (sunucuda aranır)", () => {
    expect(parseSharedLocation("https://maps.google.com/?q=%C3%96l%C3%BCdeniz")).toEqual({ kind: "query", query: "Ölüdeniz", source: "google" });
    expect(parseSharedLocation("https://www.google.com/maps/place/Kad%C4%B1k%C3%B6y+%C3%87ar%C5%9F%C4%B1/data=!4m2!3m1!1s0x14cab8:0x5d")).toEqual({ kind: "query", query: "Kadıköy Çarşı", source: "google" });
    expect(parseSharedLocation("https://www.google.com/maps/search/Pamukkale+Travertenleri/")).toEqual({ kind: "query", query: "Pamukkale Travertenleri", source: "google" });
  });

  it("q= yer adı + @ merkez → yaklaşık nokta + ad", () => {
    expect(parseSharedLocation("https://www.google.com/maps/search/kahve/@41.03,28.98,15z?q=kahve")).toEqual(pt(41.03, 28.98, { label: "kahve", approximate: true }));
  });

  it("diğer kısa bağlantılar", () => {
    expect(parseSharedLocation("https://g.co/kgs/AbC12")).toEqual({ kind: "resolve", url: "https://g.co/kgs/AbC12", source: "google" });
    expect(parseSharedLocation("https://share.google/XyZ")).toEqual({ kind: "resolve", url: "https://share.google/XyZ", source: "google" });
    expect(parseSharedLocation("https://goo.gl/other")).toBeNull();
  });

  it("g.co/kgs sonucu: google.com/search?q=…", () => {
    expect(parseSharedLocation("https://www.google.com/search?kgmid=/m/0abc&hl=tr&q=Sumela+Manast%C4%B1r%C4%B1")).toEqual({ kind: "query", query: "Sumela Manastırı", source: "google" });
  });

  it("geçersiz koordinatlar reddedilir", () => {
    expect(parseSharedLocation("https://maps.google.com/?q=0,0")).toBeNull();
    expect(parseSharedLocation("https://maps.google.com/?q=95.1,30")).toBeNull();
    expect(parseSharedLocation("https://maps.google.com/?q=45,190")).toBeNull();
  });
});

describe("Apple Haritalar", () => {
  it("ll, coordinate, daddr, q, address", () => {
    expect(parseSharedLocation("https://maps.apple.com/?ll=38.4237,27.1428&q=Kordon")).toEqual(pt(38.4237, 27.1428, { source: "apple", label: "Kordon" }));
    expect(parseSharedLocation("https://maps.apple.com/place?coordinate=37.9415,27.3415&name=Efes")).toEqual(pt(37.9415, 27.3415, { label: "Efes" }));
    expect(parseSharedLocation("https://maps.apple.com/?daddr=36.6,29.1")).toEqual(pt(36.6, 29.1, { source: "apple" }));
    expect(parseSharedLocation("https://maps.apple.com/?address=Bebek,%20Be%C5%9Fikta%C5%9F,%20%C4%B0stanbul")).toEqual({ kind: "query", query: "Bebek, Beşiktaş, İstanbul", source: "apple" });
    expect(parseSharedLocation("https://maps.apple.com/?q=Kapadokya&sll=38.6,34.8")).toEqual(pt(38.6, 34.8, { label: "Kapadokya", approximate: true }));
    expect(parseSharedLocation("https://maps.apple/p/AbC.xyz")).toEqual({ kind: "resolve", url: "https://maps.apple/p/AbC.xyz", source: "apple" });
  });
});

describe("Yandex Haritalar (boylam,enlem sırası!)", () => {
  it("ll=BOYLAM,ENLEM yaklaşık; pt ve whatshere kesin", () => {
    expect(parseSharedLocation("https://yandex.com.tr/maps/?ll=28.978400%2C41.008200&z=16")).toEqual(pt(41.0082, 28.9784, { source: "yandex", approximate: true }));
    expect(parseSharedLocation("https://yandex.com.tr/maps/?ll=28.97,41.0&pt=28.9784,41.0082&z=16")).toEqual(pt(41.0082, 28.9784, { approximate: false }));
    expect(parseSharedLocation("https://yandex.ru/maps/?pt=30.335,59.934,pm2rdm~37.6,55.7")).toEqual(pt(59.934, 30.335));
    expect(parseSharedLocation("https://yandex.com.tr/maps/?whatshere%5Bpoint%5D=32.854,39.920&whatshere%5Bzoom%5D=17")).toEqual(pt(39.92, 32.854));
  });

  it("rtext enlem,boylam (son nokta varış), text sorgusu, kısa bağlantı", () => {
    expect(parseSharedLocation("https://yandex.com.tr/maps/?rtext=41.0,29.0~39.92,32.85&rtt=auto")).toEqual(pt(39.92, 32.85));
    expect(parseSharedLocation("https://yandex.com.tr/maps/?text=Anitkabir")).toEqual({ kind: "query", query: "Anitkabir", source: "yandex" });
    expect(parseSharedLocation("https://yandex.com.tr/maps/-/CDqZrL~k")).toEqual({ kind: "resolve", url: "https://yandex.com.tr/maps/-/CDqZrL~k", source: "yandex" });
  });
});

describe("OpenStreetMap, HERE, Waze, Bing", () => {
  it("OSM mlat/mlon, #map=, route", () => {
    expect(parseSharedLocation("https://www.openstreetmap.org/?mlat=41.0082&mlon=28.9784#map=17/41.0082/28.9784")).toEqual(pt(41.0082, 28.9784, { source: "osm", approximate: false }));
    expect(parseSharedLocation("https://www.openstreetmap.org/#map=15/38.4237/27.1428")).toEqual(pt(38.4237, 27.1428, { approximate: true }));
    expect(parseSharedLocation("https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=41.0%2C29.0%3B39.92%2C32.85")).toEqual(pt(39.92, 32.85));
  });

  it("HERE", () => {
    expect(parseSharedLocation("https://share.here.com/l/41.0082,28.9784,Ayasofya")).toEqual(pt(41.0082, 28.9784, { source: "here", label: "Ayasofya" }));
    expect(parseSharedLocation("https://wego.here.com/?map=39.92,32.85,15,normal")).toEqual(pt(39.92, 32.85, { approximate: true }));
  });

  it("Waze ll, to=ll., geohash", () => {
    expect(parseSharedLocation("https://waze.com/ul?ll=40.98,29.03&navigate=yes")).toEqual(pt(40.98, 29.03, { source: "waze" }));
    expect(parseSharedLocation("https://www.waze.com/live-map/directions?to=ll.37.87%2C32.48")).toEqual(pt(37.87, 32.48));
    const gh = parseSharedLocation("https://waze.com/ul/hsxk97h6mm");
    expect(gh).toMatchObject({ kind: "point", source: "waze", approximate: true });
    if (gh?.kind === "point") {
      expect(gh.lat).toBeCloseTo(41.0, 1);
      expect(gh.lng).toBeCloseTo(28.97, 1);
    }
  });

  it("Bing cp=enlem~boylam, sp=point.", () => {
    expect(parseSharedLocation("https://www.bing.com/maps?cp=41.0082~28.9784&lvl=15")).toEqual(pt(41.0082, 28.9784, { source: "bing", approximate: true }));
    expect(parseSharedLocation("https://www.bing.com/maps?sp=point.38.42_27.14_Kordon")).toEqual(pt(38.42, 27.14, { label: "Kordon" }));
  });
});

describe("geo: URI", () => {
  it("geo:lat,lng?q=lat,lng(Ad) (Android harita intent'i)", () => {
    expect(parseGeoUri("geo:41.0082,28.9784?q=41.0082,28.9784(Ayasofya)")).toEqual(pt(41.0082, 28.9784, { source: "geo", label: "Ayasofya" }));
    expect(parseSharedLocation("geo:0,0?q=41.0082,28.9784(Galata%20Kulesi)")).toEqual(pt(41.0082, 28.9784, { label: "Galata Kulesi" }));
    expect(parseSharedLocation("Şuradayım geo:0,0?q=41.0256,28.9741(Galata Kulesi) gel")).toEqual(pt(41.0256, 28.9741, { label: "Galata Kulesi" }));
  });

  it("geo:0,0?q=adres → sorgu; geo:lat,lng;u=… → nokta; geo:0,0 → yok", () => {
    expect(parseSharedLocation("geo:0,0?q=Ni%C5%9Fanta%C5%9F%C4%B1,+%C4%B0stanbul")).toEqual({ kind: "query", query: "Nişantaşı, İstanbul", source: "geo" });
    expect(parseSharedLocation("geo:37.786971,-122.399677;u=35")).toEqual(pt(37.786971, -122.399677));
    expect(parseSharedLocation("geo:41.1,29.1?z=17")).toEqual(pt(41.1, 29.1));
    expect(parseSharedLocation("geo:0,0")).toBeNull();
  });
});

describe("google.navigation:", () => {
  it("koordinat ve adres", () => {
    expect(parseSharedLocation("google.navigation:q=41.0082,28.9784&mode=d")).toEqual(pt(41.0082, 28.9784, { source: "google" }));
    expect(parseSharedLocation("google.navigation:q=Bodrum+Kalesi")).toEqual({ kind: "query", query: "Bodrum Kalesi", source: "google" });
  });
});

describe("Düz koordinatlar", () => {
  it("ondalık çiftler", () => {
    expect(parseSharedLocation("41.0082, 28.9784")).toEqual(pt(41.0082, 28.9784, { source: "coordinates" }));
    expect(parseSharedLocation("41.0082 28.9784")).toEqual(pt(41.0082, 28.9784));
    expect(parseSharedLocation("Burası: 36.54891234,29.11567891 tam yer")).toEqual(pt(36.548912, 29.115679));
    expect(parseSharedLocation("-33.8568, 151.2153")).toEqual(pt(-33.8568, 151.2153));
  });

  it("Türkçe virgüllü ondalık (yalnızca belirsiz değilse)", () => {
    expect(parseSharedLocation("41,0082 28,9784")).toEqual(pt(41.0082, 28.9784));
    expect(parseSharedLocation("41,0082; 28,9784")).toEqual(pt(41.0082, 28.9784));
    expect(parseSharedLocation("41,0082, 28,9784")).toEqual(pt(41.0082, 28.9784));
    expect(parseSharedLocation("41,0")).toBeNull();
  });

  it("DMS ve yarım küre harfleri", () => {
    expect(parseSharedLocation(`41°00'29.5"N 28°58'42.2"E`)).toEqual(pt(41.008194, 28.978389));
    expect(parseSharedLocation("41° 0′ 29.5″ K, 28° 58′ 42.2″ D")).toEqual(pt(41.008194, 28.978389));
    expect(parseSharedLocation(`33°51'24.5"S 151°12'55.1"E`)).toEqual(pt(-33.856806, 151.215306));
    expect(parseSharedLocation("41.0082° N, 28.9784° E")).toEqual(pt(41.0082, 28.9784));
    expect(parseSharedLocation("28.9784E 41.0082N")).toEqual(pt(41.0082, 28.9784));
    expect(parseSharedLocation("N 41° 0.492' E 28° 58.703'")).toEqual(pt(41.0082, 28.978383));
  });

  it("koordinat olmayan sayılar", () => {
    expect(parseSharedLocation("Saat 10, 15 kişiyiz")).toBeNull();
    expect(parseSharedLocation("Fiyat 1.250 TL, 3.5 saat")).toBeNull();
    expect(parseSharedLocation("tel 0532 123 45 67")).toBeNull();
    expect(parseSharedLocation("95.5, 30.1")).toBeNull();
  });

  it("0,0 yalnızca açıkça yazılırsa", () => {
    expect(parseSharedLocation("0, 0")).toEqual(pt(0, 0));
    expect(parseSharedLocation("https://maps.google.com/?q=0.0,0.0")).toBeNull();
  });

  it("10, 15 tek başına tamsayı çifti koordinattır", () => {
    expect(parseCoordinatePair("10, 15")).toEqual({ lat: 10, lng: 15 });
  });
});

describe("ROVIA, bilinmeyen siteler, sorgu", () => {
  it("ROVIA bağlantıları ve lat/lng parametreli bilinmeyen siteler", () => {
    expect(parseSharedLocation("https://www.roviaroad.com/planla?ad=Ka%C5%9F&konum=36.2,29.64")).toEqual(pt(36.2, 29.64, { source: "rovia", label: "Kaş" }));
    expect(parseSharedLocation("https://www.roviaroad.com/konum?text=https%3A%2F%2Fmaps.google.com%2F%3Fq%3D41.2%2C29.2")).toEqual(pt(41.2, 29.2));
    expect(parseSharedLocation("https://example.com/poi?lat=40.1&lng=30.2")).toEqual(pt(40.1, 30.2, { source: "link" }));
    expect(parseSharedLocation("https://example.com/hakkimizda")).toBeNull();
  });

  it("allowQuery: düz yer adı", () => {
    expect(parseSharedLocation("Ölüdeniz", { allowQuery: true })).toEqual({ kind: "query", query: "Ölüdeniz", source: "coordinates" });
    expect(parseSharedLocation("Ölüdeniz")).toBeNull();
    expect(parseSharedLocation("satır1\nsatır2", { allowQuery: true })).toBeNull();
    expect(parseSharedLocation("", { allowQuery: true })).toBeNull();
    expect(parseSharedLocation(null)).toBeNull();
  });

  it("çok uzun girdi kırpılır, hata vermez", () => {
    expect(parseSharedLocation(`${"a".repeat(10_000)} 41.1, 29.1`)).toBeNull();
    expect(parseSharedLocation(`https://maps.google.com/?q=41.1,29.1 ${"x".repeat(10_000)}`)).toEqual(pt(41.1, 29.1));
  });
});

describe("yardımcılar", () => {
  it("validPoint 6 basamak", () => {
    expect(validPoint(41.12345678, 29.98765432)).toEqual({ lat: 41.123457, lng: 29.987654 });
    expect(validPoint(Number.NaN, 1)).toBeNull();
  });
  it("extractLinks noktalama ve parantez", () => {
    expect(extractLinks("(https://maps.google.com/?q=1.5,2.5), ve https://waze.com/ul?ll=1,2.")).toEqual(["https://maps.google.com/?q=1.5,2.5", "https://waze.com/ul?ll=1,2"]);
  });
  it("geohash", () => {
    const p = decodeGeohash("u4pruydqqvj")!;
    expect(p.lat).toBeCloseTo(57.64911, 4);
    expect(p.lng).toBeCloseTo(10.40744, 4);
    expect(decodeGeohash("abc")).toBeNull();
  });
  it("biçimlendirme", () => {
    expect(formatCoords({ lat: 41.0082, lng: 28.9784 })).toBe("41.008200, 28.978400");
    expect(googleMapsUrl({ lat: 41.0082, lng: 28.9784 })).toBe("https://www.google.com/maps/search/?api=1&query=41.008200%2C28.978400");
  });
});
