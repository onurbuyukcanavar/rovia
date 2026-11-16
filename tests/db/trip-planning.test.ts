import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice Yolcu" });
  bob = await createUser(db, { full_name: "Bob Gezgin" });
}, 60_000);

const STOPS = [
  { name: "İstanbul", address: "Fatih, İstanbul", lat: 41.0082, lng: 28.9784, ref: "n123" },
  { name: "Bolu", address: null, lat: 40.7356, lng: 31.6061, ref: null },
  { name: "Göreme", address: "Nevşehir", lat: 38.6431, lng: 34.8289, ref: "r42" },
];
const ROUTE = {
  polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
  distance_m: 733_000,
  duration_s: 30_000,
  legs: [{ d: 260_000, s: 10_000 }, { d: 473_000, s: 20_000 }],
  has_toll: true,
  has_ferry: false,
};

type SaveArgs = {
  id?: string | null; version?: number | null; title?: string; description?: string | null;
  date?: string | null; stops?: unknown; route?: unknown;
};

function save(userId: string, a: SaveArgs = {}) {
  return asUser(db, userId, async (tx) => {
    const r = await tx.query<{ trip_id: string; trip_version: number }>(
      "select * from save_trip_plan($1, $2, $3, $4, $5, $6, $7)",
      [
        a.id ?? null, a.version ?? null, a.title ?? "İstanbul – Kapadokya Keşif Yolculuğu", a.description ?? null,
        a.date ?? null, JSON.stringify(a.stops ?? STOPS), a.route === undefined ? JSON.stringify(ROUTE) : a.route === null ? null : JSON.stringify(a.route),
      ],
    );
    return r.rows[0];
  });
}

function stopsOf(userId: string, tripId: string) {
  return asUser(db, userId, async (tx) =>
    (await tx.query<{ kind: string; stop_order: number; name: string; osm_ref: string | null }>(
      "select kind, stop_order, name, osm_ref from trip_stops where trip_id = $1 order by stop_order", [tripId],
    )).rows,
  );
}

describe("save_trip_plan", () => {
  it("yeni yolculuğu durakları ve rotasıyla tek işlemde oluşturur", async () => {
    const r = await save(alice, { date: "2026-12-05", description: "Kış yolculuğu" });
    expect(r.trip_version).toBe(1);

    const trip = await asUser(db, alice, async (tx) =>
      (await tx.query<Record<string, unknown>>("select * from trips where id = $1", [r.trip_id])).rows[0]);
    expect(trip).toMatchObject({
      user_id: alice, status: "planned", description: "Kış yolculuğu", route_distance_m: 733_000,
      route_duration_s: 30_000, route_has_toll: true, route_has_ferry: false, version: 1,
    });
    expect(trip.route_legs).toEqual(ROUTE.legs);
    expect(trip.route_computed_at).not.toBeNull();

    expect(await stopsOf(alice, r.trip_id)).toEqual([
      { kind: "origin", stop_order: 0, name: "İstanbul", osm_ref: "n123" },
      { kind: "waypoint", stop_order: 1, name: "Bolu", osm_ref: null },
      { kind: "destination", stop_order: 2, name: "Göreme", osm_ref: "r42" },
    ]);
  });

  it("günceller: sürüm artar, duraklar yeniden sıralanır (ara durak silme/sıralama)", async () => {
    const created = await save(alice);
    const newStops = [STOPS[0], { name: "Ankara", address: null, lat: 39.92, lng: 32.85, ref: null }, STOPS[1], STOPS[2]];
    const route = { ...ROUTE, legs: [...ROUTE.legs, { d: 1, s: 1 }] };
    const updated = await save(alice, { id: created.trip_id, version: 1, title: "Yeni ad", stops: newStops, route });
    expect(updated).toEqual({ trip_id: created.trip_id, trip_version: 2 });
    expect((await stopsOf(alice, created.trip_id)).map((s) => `${s.kind}:${s.name}`)).toEqual([
      "origin:İstanbul", "waypoint:Ankara", "waypoint:Bolu", "destination:Göreme",
    ]);

    // İki durağa indir, rotasız kaydet (rota servisi yanıt vermediğinde)
    const third = await save(alice, { id: created.trip_id, version: 2, stops: [STOPS[0], STOPS[2]], route: null });
    expect(third.trip_version).toBe(3);
    const trip = await asUser(db, alice, async (tx) =>
      (await tx.query<Record<string, unknown>>("select route_polyline, route_distance_m, route_legs, route_computed_at from trips where id = $1", [created.trip_id])).rows[0]);
    expect(trip).toEqual({ route_polyline: null, route_distance_m: null, route_legs: null, route_computed_at: null });
    expect(await stopsOf(alice, created.trip_id)).toHaveLength(2);
  });

  it("eski sürümle kaydetme çakışma verir ve hiçbir şeyi değiştirmez", async () => {
    const created = await save(alice, { title: "Orijinal" });
    await save(alice, { id: created.trip_id, version: 1, title: "Sekme A" });
    await expect(save(alice, { id: created.trip_id, version: 1, title: "Sekme B" })).rejects.toThrow(/trip_conflict/);
    const title = await asUser(db, alice, async (tx) =>
      (await tx.query<{ title: string }>("select title from trips where id = $1", [created.trip_id])).rows[0].title);
    expect(title).toBe("Sekme A");
    expect(await stopsOf(alice, created.trip_id)).toHaveLength(3);
  });

  it("doğrudan güncelleme de sürümü artırır (başka ekranlardan yapılan değişiklikler)", async () => {
    const created = await save(alice);
    const v = await asUser(db, alice, async (tx) =>
      (await tx.query<{ version: number }>("update trips set title = 'x' where id = $1 returning version", [created.trip_id])).rows[0].version);
    expect(v).toBe(2);
    await expect(save(alice, { id: created.trip_id, version: 1 })).rejects.toThrow(/trip_conflict/);
  });

  it("başkasının yolculuğu bulunamaz; durakları değişmez", async () => {
    const created = await save(alice);
    await expect(save(bob, { id: created.trip_id, version: 1, title: "hack" })).rejects.toThrow(/trip_not_found/);
    expect(await stopsOf(alice, created.trip_id)).toHaveLength(3);
  });

  it("tamamlanmış yolculuğun planı değiştirilemez", async () => {
    const created = await save(alice);
    await asUser(db, alice, (tx) => tx.query("update trips set status = 'completed' where id = $1", [created.trip_id]));
    await expect(save(alice, { id: created.trip_id, version: 2 })).rejects.toThrow(/trip_not_editable/);
  });

  it("geçersiz durak ve rota girdilerini reddeder", async () => {
    await expect(save(alice, { stops: [STOPS[0]] })).rejects.toThrow(/invalid_stops/);
    await expect(save(alice, { stops: Array.from({ length: 21 }, () => STOPS[0]) })).rejects.toThrow(/invalid_stops/);
    await expect(save(alice, { stops: { a: 1 } })).rejects.toThrow(/invalid_stops/);
    // Bacak sayısı durak sayısıyla uyuşmuyor → rota başka duraklara ait
    await expect(save(alice, { route: { ...ROUTE, legs: [ROUTE.legs[0]] } })).rejects.toThrow(/invalid_route/);
    await expect(save(alice, { route: { ...ROUTE, polyline: null } })).rejects.toThrow(/invalid_route/);
    // Tablo kısıtları da işler: boş ad, geçersiz OSM referansı, aralık dışı tarih
    await expect(save(alice, { title: "" })).rejects.toThrow(/check constraint/);
    await expect(save(alice, { stops: [STOPS[0], { ...STOPS[2], ref: "abc" }] , route: null })).rejects.toThrow(/osm_ref/);
    await expect(save(alice, { date: "1999-01-01" })).rejects.toThrow(/planned_date/);
  });

  it("başarısız kayıt yarım iz bırakmaz (atomik)", async () => {
    const count = () => asUser(db, alice, async (tx) =>
      Number((await tx.query<{ n: string }>("select count(*) n from trips")).rows[0].n));
    const before = await count();
    await expect(save(alice, { stops: [STOPS[0], { ...STOPS[2], lat: 200 }], route: null })).rejects.toThrow();
    expect(await count()).toBe(before);
  });

  it("anonim kullanıcı çağıramaz", async () => {
    await expect(
      asUser(db, null, (tx) => tx.query("select * from save_trip_plan(null, null, 'x', null, null, '[]'::jsonb, null)")),
    ).rejects.toThrow(/permission denied/);
  });
});
