import { describe, expect, it } from "vitest";
import { encodePolyline } from "@/lib/geo";
import { DEFAULT_SHARE_OPTIONS, type SharePayload } from "./types";
import {
  buildShareView, mediaPaths, normalizeOptions, previewItems, projectRoute, robotsFor, shareStateFromRow, toTravelogue, visibilityLabel,
} from "./view";

const route = [encodePolyline([{ lat: 39.9, lng: 32.8 }, { lat: 40.0, lng: 33.0 }]), encodePolyline([{ lat: 40.1, lng: 33.2 }, { lat: 40.2, lng: 33.4 }])].join(" ");
const photo = (id: string) => ({ id, path: `u/${id}.webp`, thumb: `u/${id}_t.webp`, width: 800, height: 600, caption: null, takenAt: "2026-05-01T10:00:00Z" });

const tripPayload = (over: Partial<SharePayload> = {}): SharePayload => ({
  kind: "trip", visibility: "link", options: { ...DEFAULT_SHARE_OPTIONS }, privacyRadiusM: 500, ownerName: null, route,
  trip: {
    title: "Kapadokya turu", description: "Güzel bir gün", status: "completed", plannedDate: null,
    startedAt: "2026-05-01T08:00:00Z", completedAt: "2026-05-01T18:00:00Z",
    stats: { distanceM: 123400, elapsedS: 7200, movingS: 6000, avgKmh: 61, startedAt: "2026-05-01T08:00:00Z", endedAt: "2026-05-01T18:00:00Z" },
    plannedDistanceM: null, plannedDurationS: null,
    stops: [{ name: "Ara durak", kind: "waypoint", lat: 39.95, lng: 32.9 }, { name: "Göreme", kind: "destination", lat: null, lng: null }],
    notes: null,
    photos: [photo("a"), photo("b")],
  },
  ...over,
});

describe("paylaşım ayarları", () => {
  it("seçenekleri varsayılanlarla normalleştirir, bilinmeyenleri atar", () => {
    expect(normalizeOptions({ notes: true, foo: true, route: "x" })).toEqual({ ...DEFAULT_SHARE_OPTIONS, notes: true });
    expect(normalizeOptions(null)).toEqual(DEFAULT_SHARE_OPTIONS);
  });

  it("satır yoksa özel; iptal edilmemiş satır bağlantıyı taşır", () => {
    expect(shareStateFromRow(null, 1000)).toMatchObject({ visibility: "private", token: null, privacyRadiusM: 1000 });
    expect(shareStateFromRow({ visibility: "public", token: "t", options: {}, privacy_radius_m: 250 }))
      .toMatchObject({ visibility: "public", token: "t", privacyRadiusM: 250 });
  });

  it("görünürlük etiketleri ve robots", () => {
    expect(visibilityLabel("private")).toBe("Yalnızca ben");
    expect(visibilityLabel("link")).toBe("Bağlantıya sahip olanlar");
    expect(visibilityLabel("public")).toBe("Herkese açık");
    expect(robotsFor("public")).toEqual({ index: true, follow: true });
    expect(robotsFor("link")).toEqual({ index: false, follow: false });
    expect(robotsFor(null).index).toBe(false);
  });
});

describe("Paylaşılacaklar özeti", () => {
  it("gerçek sayıları ve kırpmayı listeler", () => {
    const items = previewItems(tripPayload());
    expect(items).toContain("Başlık: “Kapadokya turu”");
    expect(items).toContain("Rota (başlangıç ve bitişte ±500 m kırpıldı)");
    expect(items).toContain("2 durak");
    expect(items).toContain("1 durağın konumu gizlendi");
    expect(items).toContain("2 fotoğraf");
    expect(items).toContain("Başlangıç noktası gizli");
    expect(items.some((i) => i.includes("not"))).toBe(false);
  });

  it("uç noktalar açıkken kırpma yok; null yanıt boş", () => {
    const p = tripPayload({ options: { ...DEFAULT_SHARE_OPTIONS, endpoints: true }, privacyRadiusM: 1000 });
    expect(previewItems(p)).toContain("Rota");
    expect(previewItems(null)).toEqual([]);
  });
});

describe("görünüm modeli", () => {
  it("paylaşım JSON'unu sayfa modeline çevirir", () => {
    const signed = new Map([["u/a.webp", "https://x/a"], ["u/a_t.webp", "https://x/at"]]);
    const v = buildShareView(tripPayload(), signed);
    expect(v.title).toBe("Kapadokya turu");
    expect(v.paths).toHaveLength(2);
    expect(v.chips.map((c) => c.key)).toEqual(["distance", "duration", "moving", "avg"]);
    expect(v.photos.map((p) => p.id)).toEqual(["a"]); // imzalanamayan fotoğraf gösterilmez
    expect(v.coverUrl).toBe("https://x/a");
    expect(v.canCopy).toBe(true);
    expect(v.privacyRadiusM).toBe(500);
    expect(mediaPaths(tripPayload())).toEqual(["u/a.webp", "u/a_t.webp", "u/b.webp", "u/b_t.webp"]);
  });

  it("istatistik kapalıysa çip ve tarih yok; konumlu durak yoksa kopyalanamaz", () => {
    const p = tripPayload({ options: { ...DEFAULT_SHARE_OPTIONS, stats: false } });
    p.trip!.stops = [{ name: "X", kind: "destination", lat: null, lng: null }];
    const v = buildShareView(p, new Map());
    expect(v.chips).toEqual([]);
    expect(v.dateRange).toBeNull();
    expect(v.canCopy).toBe(false);
  });

  it("seyahatnameyi kitap görünümü tipine eşler", () => {
    const p: SharePayload = {
      ...tripPayload(), kind: "travelogue",
      travelogue: {
        title: "Kitap", subtitle: "Alt", purpose: null, summary: null, ordering: "manual", updatedAt: "2026-05-02T00:00:00Z",
        cover: photo("c"),
        sections: [{ kind: "cover", title: "Kapak", content: null }, { kind: "map", title: "Harita", content: null }],
        entries: [{
          id: "e1", entryType: "place", title: "Göreme", introduction: null, narrative: { type: "doc", content: [] }, historyNotes: null,
          personalReview: null, locationName: "Göreme", address: null, lat: 38.6, lng: 34.8, visitedAt: null, tags: null,
          aiAssisted: false, sortOrder: 0, createdAt: "2026-05-01T12:00:00Z", photos: [photo("a")],
        }],
        media: { d: photo("d") },
      },
    };
    const tv = toTravelogue(p, new Map([["u/c.webp", "https://x/c"]]))!;
    expect(tv.title).toBe("Kitap");
    expect(tv.ordering).toBe("manual");
    expect(tv.sections.map((s) => s.kind)).toEqual(["cover", "map"]);
    expect(tv.entries[0]).toMatchObject({ id: "e1", tags: [], photos: [{ mediaId: "a", caption: null }] });
    expect(tv.media.map((m) => m.id).sort()).toEqual(["a", "c", "d"]);
    expect(tv.media.find((m) => m.id === "c")?.url).toBe("https://x/c");
    expect(tv.trip?.polyline).toBe(route);
    expect(tv.trip?.startLabel).toBeNull();
    expect(toTravelogue(tripPayload(), new Map())).toBeNull();
  });
});

describe("sosyal kart rota projeksiyonu", () => {
  it("rotayı kutuya sığdırır, en-boy oranını korur ve ortalar", () => {
    const d = projectRoute([[{ lat: 40, lng: 30 }, { lat: 40, lng: 32 }]], { width: 400, height: 400, padding: 20 });
    expect(d).toMatch(/^M20 200 L380 200$/);
    const multi = projectRoute([[{ lat: 39, lng: 32 }, { lat: 40, lng: 32 }], [{ lat: 40, lng: 33 }, { lat: 41, lng: 33 }]], { width: 200, height: 200 });
    expect(multi.match(/M/g)).toHaveLength(2);
    for (const n of multi.match(/-?\d+(\.\d+)?/g)!.map(Number)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(200);
    }
  });

  it("kuzey yukarıda: enlem arttıkça y azalır; boş/tek nokta için boş", () => {
    const d = projectRoute([[{ lat: 39, lng: 32 }, { lat: 41, lng: 32 }]], { width: 100, height: 100 });
    const [, y1, , y2] = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(y1).toBeGreaterThan(y2);
    expect(projectRoute([], { width: 100, height: 100 })).toBe("");
    expect(projectRoute([[{ lat: 1, lng: 1 }]], { width: 100, height: 100 })).toBe("");
  });

  it("uzun izleri örnekler", () => {
    const long = Array.from({ length: 5000 }, (_, i) => ({ lat: 39 + i * 0.0001, lng: 32 + i * 0.0002 }));
    const d = projectRoute([long], { width: 100, height: 100 }, 500);
    expect(d.split("L").length).toBeLessThanOrEqual(502);
  });
});
