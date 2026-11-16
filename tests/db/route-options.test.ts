import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;

const stops = JSON.stringify([
  { name: "Gebze", address: null, lat: 40.8027, lng: 29.4307, ref: null },
  { name: "Yalova", address: null, lat: 40.655, lng: 29.276, ref: null },
]);

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  // Gebze → Yalova hattı boyunca örnek yerler
  await db.exec(`
    insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, admin, geog, tags, importance) values
      ('n1', 'poi', 'historic', 'castle', 'Hersek Kalesi', 'hersek kalesi', 'Altınova, Yalova', 'SRID=4326;POINT(29.50 40.70)', '{"wikidata":"Q1"}', 0.3),
      ('n2', 'poi', 'nature', 'waterfall', 'Sudüşen Şelalesi', 'suduşen selalesi', 'Termal, Yalova', 'SRID=4326;POINT(29.35 40.72)', '{}', 0.15),
      ('n3', 'poi', 'historic', 'monument', 'Adsız anıt', 'adsiz anit', 'Gebze, Kocaeli', 'SRID=4326;POINT(29.43 40.78)', '{}', 0.15),
      ('n4', 'poi', 'restaurant', 'restaurant', 'Kebapçı', 'kebapci', 'Gebze, Kocaeli', 'SRID=4326;POINT(29.43 40.79)', '{"wikidata":"Q9"}', 0.25),
      ('n5', 'poi', 'historic', 'archaeological_site', 'Uzak Ören Yeri', 'uzak oren yeri', 'Bursa', 'SRID=4326;POINT(29.06 40.19)', '{"wikidata":"Q5"}', 0.3),
      ('n6', 'poi', 'historic', 'tomb', 'Korunan Türbe', 'korunan turbe', 'Gebze, Kocaeli', 'SRID=4326;POINT(29.42 40.76)', '{"heritage":"2"}', 0.15);`);
}, 60_000);

describe("save_trip_plan rota seçenekleri", () => {
  it("seçenekler normalize edilip kaydedilir ve güncellenir; bilinmeyen anahtar atılır", async () => {
    const created = await asUser(db, alice, async (tx) =>
      (await tx.query<{ trip_id: string; trip_version: number }>(
        "select * from save_trip_plan(null, null, 'Gebze–Yalova', null, null, $1::jsonb, null, $2::jsonb)",
        [stops, JSON.stringify({ avoid_tolls: true, avoid_ferries: false, hack: 1 })])).rows[0]);
    const opts = async () => asUser(db, alice, async (tx) => (await tx.query("select route_options o from trips where id = $1", [created.trip_id])).rows[0]);
    expect(await opts()).toEqual({ o: { avoid_tolls: true } });

    await asUser(db, alice, (tx) => tx.query(
      "select * from save_trip_plan($1, $2, 'Gebze–Yalova', null, null, $3::jsonb, null, $4::jsonb)",
      [created.trip_id, created.trip_version, stops, JSON.stringify({ avoid_highways: true, avoid_ferries: true })]));
    expect(await opts()).toEqual({ o: { avoid_ferries: true, avoid_highways: true } });

    // Eski çağrı biçimi (seçeneksiz) çalışmaya devam eder
    const legacy = await asUser(db, alice, async (tx) =>
      (await tx.query<{ trip_id: string }>("select * from save_trip_plan(null, null, 'Eski', null, null, $1::jsonb, null)", [stops])).rows[0]);
    const row = await asUser(db, alice, async (tx) => (await tx.query("select route_options o from trips where id = $1", [legacy.trip_id])).rows[0]);
    expect(row).toEqual({ o: {} });

    await expect(asUser(db, alice, (tx) => tx.query("update trips set route_options = '{\"x\":1}' where id = $1", [created.trip_id])))
      .rejects.toThrow(/check/i);
  });
});

describe("route_suggestions", () => {
  const route = JSON.stringify({ type: "LineString", coordinates: [[29.4307, 40.8027], [29.43, 40.77], [29.40, 40.69], [29.276, 40.655]] });

  it("yalnızca kayda değer turistik yerler; restoran ve uzaktaki yer gelmez; puana göre sıralı", async () => {
    const rows = await asUser(db, alice, async (tx) =>
      (await tx.query<{ osm_ref: string; score: number; along_m: number }>("select osm_ref, score, along_m from route_suggestions($1::jsonb, 10000, 40)", [route])).rows);
    const refs = rows.map((r) => r.osm_ref);
    expect(refs).toEqual(expect.arrayContaining(["n1", "n2", "n6"]));
    expect(refs).not.toContain("n3"); // Vikipedi'siz, korumasız, sıradan anıt
    expect(refs).not.toContain("n4"); // restoran
    expect(refs).not.toContain("n5"); // rotaya çok uzak (Bursa)
    expect(refs[0]).toBe("n1"); // Vikiveri + kale
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].score).toBeGreaterThanOrEqual(rows[i].score);
  });

  it("geçersiz girdiler reddedilir", async () => {
    await expect(asUser(db, alice, (tx) => tx.query("select * from route_suggestions($1::jsonb, 50, 10)", [route]))).rejects.toThrow(/invalid_arguments/);
    await expect(asUser(db, alice, (tx) => tx.query("select * from route_suggestions('{\"type\":\"Point\"}'::jsonb)"))).rejects.toThrow(/invalid_route/);
  });
});
