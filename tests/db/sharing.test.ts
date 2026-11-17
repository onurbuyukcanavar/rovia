import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";
import { decodePolyline, encodePolyline } from "@/lib/geo";

let db: TestDb;
let alice: string;
let bob: string;
let trip: string;
let activeTrip: string;
let photoHome: { id: string; path: string };
let photoAway: { id: string; path: string };

type Row = Record<string, unknown>;
const q = <T = Row>(user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const anon = async <T = Row>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return (await tx.query<T>(sql, params)).rows;
  });

// Ev: Kadıköy (40.990, 29.030) → Kapadokya (38.643, 34.828)
const HOME = { lat: 40.99, lng: 29.03 };
// Göreme; iz Uçhisar'da (≈2,5 km ötede) biter
const AWAY = { lat: 38.643, lng: 34.828 };
const END = { lat: 38.63, lng: 34.805 };
const line = [HOME, { lat: 40.995, lng: 29.06 }, { lat: 40.5, lng: 30.5 }, { lat: 39.5, lng: 33 }, { lat: 38.65, lng: 34.83 }, END];

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice Yılmaz" });
  bob = await createUser(db, { full_name: "Bob" });
  trip = (await db.query<{ id: string }>(
    "insert into public.trips (user_id, title, status, started_at, completed_at) values ($1, 'Kapadokya', 'completed', now() - interval '2 days', now()) returning id",
    [alice])).rows[0].id;
  await db.query(
    `insert into public.trip_recordings (trip_id, user_id, status, started_at, ended_at, total_distance_m, elapsed_duration_s, moving_duration_s, simplified_polyline, client_id)
     values ($1, $2, 'completed', now() - interval '2 days', now(), 730000, 30000, 27000, $3, $4)`,
    [trip, alice, encodePolyline(line), randomUUID()]);
  await db.query(
    `insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values
     ($1, $2, 'origin', 0, 'Ev', $3, $4), ($1, $2, 'waypoint', 1, 'Komşu kafe', 40.991, 29.031), ($1, $2, 'destination', 2, 'Göreme', $5, $6)`,
    [trip, alice, HOME.lat, HOME.lng, AWAY.lat, AWAY.lng]);
  await db.query(
    `insert into public.journal_notes (user_id, trip_id, body, latitude, longitude) values ($1, $2, 'Evden çıktık', $3, $4), ($1, $2, 'Balonlar', $5, $6)`,
    [alice, trip, HOME.lat, HOME.lng, AWAY.lat, AWAY.lng]);
  const media = async (lat: number, lng: number) => {
    const id = randomUUID();
    const path = `${alice}/${id}.webp`;
    await db.query(
      "insert into public.media_assets (id, user_id, trip_id, storage_path, thumb_path, mime_type, size_bytes, latitude, longitude) values ($1, $2, $3, $4, $5, 'image/webp', 10, $6, $7)",
      [id, alice, trip, path, `${alice}/${id}_t.webp`, lat, lng]);
    return { id, path };
  };
  photoHome = await media(HOME.lat, HOME.lng);
  photoAway = await media(AWAY.lat, AWAY.lng);
  activeTrip = (await db.query<{ id: string }>("insert into public.trips (user_id, title, status) values ($1, 'Şu an', 'active') returning id", [alice])).rows[0].id;
}, 60_000);

describe("share_set", () => {
  it("varsayılan özel; bağlantı oluşturur, seçenekleri normalleştirir, yolculuk görünürlüğünü günceller", async () => {
    expect((await q(alice, "select visibility from trips where id = $1", [trip]))[0].visibility).toBe("private");
    const [r] = await q<{ r: { token: string; options: Row; privacyRadiusM: number } }>(alice,
      "select share_set('trip', $1, 'link', '{\"notes\": true, \"hack\": 1}'::jsonb) r", [trip]);
    expect(r.r.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r.r.options).toEqual({ route: true, stats: true, stops: true, photos: true, notes: true, travelogue: true, ownerName: false, endpoints: false });
    expect(r.r.privacyRadiusM).toBe(500);
    expect((await q(alice, "select visibility from trips where id = $1", [trip]))[0].visibility).toBe("link");
    // Aynı bağlantı korunur; yenile → yeni bağlantı, eski geçersiz
    const [again] = await q<{ r: { token: string } }>(alice, "select share_set('trip', $1, 'public', '{\"notes\": true}'::jsonb) r", [trip]);
    expect(again.r.token).toBe(r.r.token);
    const [rot] = await q<{ r: { token: string } }>(alice, "select share_set('trip', $1, 'link', '{\"notes\": true}'::jsonb, null, true) r", [trip]);
    expect(rot.r.token).not.toBe(r.r.token);
    expect((await anon<{ g: unknown }>("select share_get($1) g", [r.r.token]))[0].g).toBeNull();
  });

  it("aktif yolculuk paylaşılamaz; başkasının yolculuğu bulunamaz; anonim çağıramaz", async () => {
    await expect(q(alice, "select share_set('trip', $1, 'link')", [activeTrip])).rejects.toThrow(/trip_active/);
    await expect(q(bob, "select share_set('trip', $1, 'link')", [trip])).rejects.toThrow(/not_found/);
    await expect(anon("select share_set('trip', $1, 'link')", [trip])).rejects.toThrow(/permission denied/);
  });
});

describe("share_get (oturumsuz)", () => {
  let token: string;
  beforeAll(async () => {
    const [r] = await q<{ r: { token: string } }>(alice, "select share_set('trip', $1, 'link', '{\"notes\": true}'::jsonb) r", [trip]);
    token = r.r.token;
  });

  it("rotanın ev çevresi kırpılır; ev çevresindeki durak, not ve fotoğraf paylaşılmaz; sahibin adı gizli", async () => {
    const [{ g }] = await anon<{ g: Row & { trip: Row; route: string } }>("select share_get($1) g", [token]);
    expect(g.kind).toBe("trip");
    expect(g.ownerName).toBeNull();
    const pts = g.route.split(" ").flatMap((p) => decodePolyline(p));
    const nearHome = pts.filter((p) => Math.abs(p.lat - HOME.lat) < 0.004 && Math.abs(p.lng - HOME.lng) < 0.005);
    expect(nearHome).toEqual([]);
    expect(pts.length).toBeGreaterThan(2);
    const trip = g.trip as { stops: Row[]; notes: Row[]; photos: Row[]; stats: Row };
    expect(trip.stops.map((s) => s.name)).toEqual(["Göreme"]);
    // İzin bittiği nokta (Uçhisar) çevresi de kırpılır
    expect(pts.filter((p) => Math.abs(p.lat - END.lat) < 0.003 && Math.abs(p.lng - END.lng) < 0.004)).toEqual([]);
    expect(trip.notes.map((n) => n.body)).toEqual(["Balonlar"]);
    expect(trip.photos.map((p) => p.id)).toEqual([photoAway.id]);
    expect(trip.photos[0]).not.toHaveProperty("lat");
    expect(trip.stats.distanceM).toBe(730000);
  });

  it("seçenekler kapatılınca alanlar dönmez; uç noktalar açıkça seçilirse kırpılmaz", async () => {
    await q(alice, "select share_set('trip', $1, 'link', '{\"route\": false, \"photos\": false, \"stats\": false, \"ownerName\": true}'::jsonb)", [trip]);
    const [{ g }] = await anon<{ g: Row & { trip: Row } }>("select share_get($1) g", [token]);
    expect(g.route).toBeNull();
    expect((g.trip as Row).photos).toBeNull();
    expect((g.trip as Row).stats).toBeNull();
    expect(g.ownerName).toBe("Alice Yılmaz");
    await q(alice, "select share_set('trip', $1, 'link', '{\"endpoints\": true}'::jsonb)", [trip]);
    const [{ g: g2 }] = await anon<{ g: { trip: { stops: Row[] } } }>("select share_get($1) g", [token]);
    expect(g2.trip.stops.map((s) => s.name)).toEqual(["Ev", "Komşu kafe", "Göreme"]);
    await q(alice, "select share_set('trip', $1, 'link', '{\"notes\": true}'::jsonb)", [trip]);
  });

  it("geçersiz biçim ve iptal edilmiş bağlantı NULL; anonim tablolara erişemez", async () => {
    expect((await anon<{ g: unknown }>("select share_get('abc') g"))[0].g).toBeNull();
    expect((await anon<{ g: unknown }>("select share_get($1) g", ["f".repeat(64)]))[0].g).toBeNull();
    await expect(anon("select * from shares")).rejects.toThrow(/permission denied/);
    await expect(anon("select * from trips")).rejects.toThrow(/permission denied/);
  });

  it("fotoğraf dosyası yalnızca aktif paylaşım kapsamındaysa erişilebilir", async () => {
    expect((await anon<{ ok: boolean }>("select media_shared($1) ok", [photoAway.path]))[0].ok).toBe(true);
    expect((await anon<{ ok: boolean }>("select media_shared($1) ok", [`${bob}/x.webp`]))[0].ok).toBe(false);
    await q(alice, "select share_set('trip', $1, 'link', '{\"photos\": false}'::jsonb)", [trip]);
    expect((await anon<{ ok: boolean }>("select media_shared($1) ok", [photoAway.path]))[0].ok).toBe(false);
    await q(alice, "select share_set('trip', $1, 'private')", [trip]);
    expect((await anon<{ g: unknown }>("select share_get($1) g", [token]))[0].g).toBeNull();
    expect((await anon<{ ok: boolean }>("select media_shared($1) ok", [photoAway.path]))[0].ok).toBe(false);
    expect((await q(alice, "select visibility from trips where id = $1", [trip]))[0].visibility).toBe("private");
  });
});

describe("seyahatname paylaşımı ve kopyalama", () => {
  it("seyahatname: gizli bölümler ve ev yakınındaki yazı konumu paylaşılmaz; metindeki görseller eşlenir", async () => {
    const [{ id: tl }] = await q<{ id: string }>(alice, "select travelogue_create($1, null, false) id", [trip]);
    await q(alice, "update travelogue_sections set is_visible = false where travelogue_id = $1 and kind = 'epilogue'", [tl]);
    const doc = { type: "doc", content: [{ type: "roviaImage", attrs: { mediaId: photoAway.id, caption: "Balon" } }] };
    await q(alice, "select travelogue_entry_create($1, $2::jsonb)", [tl, JSON.stringify({ title: "Evden çıkış", lat: HOME.lat, lng: HOME.lng, location_name: "Ev" })]);
    const [{ id: e2 }] = await q<{ id: string }>(alice, "select travelogue_entry_create($1, $2::jsonb) id", [tl, JSON.stringify({ title: "Göreme", lat: AWAY.lat, lng: AWAY.lng })]);
    await q(alice, "select travelogue_entry_save($1, 1, $2::jsonb)", [e2, JSON.stringify({ narrative: doc })]);
    const [r] = await q<{ r: { token: string } }>(alice, "select share_set('travelogue', $1, 'public') r", [tl]);
    const [{ g }] = await anon<{ g: { kind: string; travelogue: { sections: Row[]; entries: Row[]; media: Record<string, Row> } } }>("select share_get($1) g", [r.r.token]);
    expect(g.kind).toBe("travelogue");
    expect(g.travelogue.sections.map((s) => s.kind)).not.toContain("epilogue");
    const home = g.travelogue.entries.find((e) => e.title === "Evden çıkış")!;
    expect([home.lat, home.lng, home.locationName]).toEqual([null, null, null]);
    expect(Object.keys(g.travelogue.media)).toEqual([photoAway.id]);
    expect((await anon<{ ok: boolean }>("select media_shared($1) ok", [photoAway.path]))[0].ok).toBe(true);
    expect((await anon<{ ok: boolean }>("select media_shared($1) ok", [photoHome.path]))[0].ok).toBe(false);
  });

  it("kendi yolculuğunu plan olarak kopyalar; paylaşılandan yalnızca görünür duraklar kopyalanır", async () => {
    const [{ id }] = await q<{ id: string }>(alice, "select trip_copy($1, 'Kapadokya tekrar') id", [trip]);
    const stops = await q<{ name: string }>(alice, "select name from trip_stops where trip_id = $1 order by stop_order", [id]);
    expect(stops.map((s) => s.name)).toEqual(["Ev", "Komşu kafe", "Göreme"]);
    await expect(q(bob, "select trip_copy($1)", [trip])).rejects.toThrow(/not_found/);

    const [r] = await q<{ r: { token: string } }>(alice, "select share_set('trip', $1, 'link') r", [trip]);
    const [{ id: copied }] = await q<{ id: string }>(bob, "select share_copy($1) id", [r.r.token]);
    const bobStops = await q<{ name: string; kind: string }>(bob, "select name, kind from trip_stops where trip_id = $1 order by stop_order", [copied]);
    expect(bobStops).toEqual([{ name: "Göreme", kind: "destination" }]);
    expect((await q(bob, "select status, user_id from trips where id = $1", [copied]))[0]).toEqual({ status: "planned", user_id: bob });
    await expect(anon("select share_copy($1)", [r.r.token])).rejects.toThrow(/permission denied/);
  });
});
