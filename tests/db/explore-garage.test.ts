import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

const q = <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const feature = (ref: string, kind: string, category: string, subtype: string, name: string, lng: number, lat: number, tags: object = {}, importance = 0.1) =>
  db.query(
    `insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, geog, tags, importance)
     values ($1, $2, $3, $4, $5, lower($5), extensions.st_setsrid(extensions.st_makepoint($6, $7), 4326)::extensions.geography, $8::jsonb, $9)`,
    [ref, kind, category, subtype, name, lng, lat, JSON.stringify(tags), importance]);

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  bob = await createUser(db, { full_name: "Bob" });
  // Kapadokya çevresi
  await feature("n1", "poi", "nature", "waterfall", "Kapuzbaşı Şelalesi", 34.9, 38.6);
  await feature("n2", "poi", "historic", "castle", "Uçhisar Kalesi", 34.80, 38.63, { wikidata: "Q1" }, 0.3);
  await feature("n3", "poi", "historic", "ruins", "Antik yerleşim", 34.85, 38.64);
  await feature("n4", "poi", "restaurant", "restaurant", "Testi Kebap Evi", 34.83, 38.64, { cuisine: "turkish;kebab" });
  await feature("n5", "poi", "restaurant", "fast_food", "Burger", 34.83, 38.64, { cuisine: "burger" });
  await feature("n6", "settlement", "village", "village", "Ortahisar", 34.86, 38.63);
  await feature("n7", "poi", "worship", "muslim", "Cami", 34.84, 38.63);
  await feature("n8", "poi", "museum", "museum", "Göreme Açık Hava Müzesi", 34.84, 38.64, { wikidata: "Q2" }, 0.3);
  // Uzak: İzmir
  await feature("n9", "poi", "historic", "castle", "Kadifekale", 27.14, 38.41);
}, 60_000);

const bbox = [34.7, 38.5, 35.0, 38.7];

describe("explore_features", () => {
  it("kategoriye göre harita alanında filtreler; önemliler önce gelir", async () => {
    const run = async (cat: string) =>
      (await q<{ name: string }>(alice, "select name from explore_features($1, $2::float8[])", [cat, bbox])).map((r) => r.name);
    expect(await run("waterfall")).toEqual(["Kapuzbaşı Şelalesi"]);
    expect(await run("castle")).toEqual(["Uçhisar Kalesi"]);
    expect(await run("ancient")).toEqual(["Antik yerleşim"]);
    expect(await run("gastronomy")).toEqual(["Testi Kebap Evi"]);
    expect(await run("village")).toEqual(["Ortahisar"]);
    expect(await run("mosque")).toEqual(["Cami"]);
    expect(await run("featured")).toEqual(["Göreme Açık Hava Müzesi", "Uçhisar Kalesi"].sort((a, b) => a.localeCompare(b, "tr")));
    expect(await run("heritage")).toEqual(expect.arrayContaining(["Uçhisar Kalesi", "Göreme Açık Hava Müzesi"]));
  });

  it("rota boyunca yarıçap içindekileri, rota üzerindeki konumuyla döndürür", async () => {
    const route = { type: "LineString", coordinates: [[34.70, 38.63], [35.00, 38.63]] };
    const rows = await q<{ name: string; distance_m: number; along_m: number }>(alice,
      "select name, distance_m, along_m from explore_features('castle', null, $1::jsonb, 3000)", [JSON.stringify(route)]);
    expect(rows.map((r) => r.name)).toEqual(["Uçhisar Kalesi"]);
    expect(rows[0].along_m).toBeGreaterThan(5000);
  });

  it("geçersiz kategori, çok geniş alan ve geçersiz rota reddedilir", async () => {
    await expect(q(alice, "select * from explore_features('restaurant', $1::float8[])", [bbox])).rejects.toThrow(/invalid_arguments/);
    await expect(q(alice, "select * from explore_features('castle', $1::float8[])", [[25, 35, 45, 43]])).rejects.toThrow(/area_too_large/);
    expect(await q(alice, "select * from explore_features('featured', $1::float8[])", [[25, 35, 45, 43]])).toHaveLength(2);
    await expect(q(alice, "select * from explore_features('castle', $1::float8[])", [[35, 38, 34, 39]])).rejects.toThrow(/invalid_bbox/);
    await expect(q(alice, "select * from explore_features('castle', null, '{\"type\":\"Point\"}'::jsonb)")).rejects.toThrow(/invalid_route/);
  });
});

describe("garaj", () => {
  it("varsayılan araç tek; başkasının aracı varsayılan yapılamaz; araç sınırı 20", async () => {
    const [a] = await q<{ id: string }>(alice, "insert into vehicles (user_id, name, fuel_type, consumption_per_100km) values ($1, 'Corolla', 'gasoline', 6.4) returning id", [alice]);
    const [b] = await q<{ id: string }>(alice, "insert into vehicles (user_id, name, fuel_type) values ($1, 'Doblo', 'diesel') returning id", [alice]);
    await q(alice, "select vehicle_set_default($1)", [a.id]);
    await q(alice, "select vehicle_set_default($1)", [b.id]);
    expect(await q(alice, "select name from vehicles where is_default")).toEqual([{ name: "Doblo" }]);
    await q(alice, "select vehicle_set_default(null)");
    expect(await q(alice, "select name from vehicles where is_default")).toEqual([]);

    await expect(q(bob, "select vehicle_set_default($1)", [a.id])).rejects.toThrow(/vehicle_not_found/);
    expect(await q(bob, "select * from vehicles")).toEqual([]);

    for (let i = 0; i < 18; i++) await q(alice, "insert into vehicles (user_id, name) values ($1, $2)", [alice, `Araç ${i}`]);
    await expect(q(alice, "insert into vehicles (user_id, name) values ($1, 'Fazla')", [alice])).rejects.toThrow(/too_many_vehicles/);
  });

  it("maliyet varsayımları boyut sınırıyla yolculuğa ve ayarlara yazılır", async () => {
    const [t] = await q<{ id: string }>(alice, "insert into trips (user_id, title) values ($1, 'Ege') returning id", [alice]);
    await q(alice, "update trips set cost_assumptions = $2::jsonb where id = $1",
      [t.id, JSON.stringify({ fuelType: "gasoline", consumption: 6.4, fuelPrice: 71.2, priceDate: "2026-11-17", tolls: [] })]);
    await expect(q(alice, "update trips set cost_assumptions = '[]'::jsonb where id = $1", [t.id])).rejects.toThrow();
    await q(alice, "update user_settings set cost_defaults = $1::jsonb where user_id = $2",
      [JSON.stringify({ fuelPrices: { gasoline: { price: 71.2, date: "2026-11-17" } } }), alice]);
    expect((await q<{ c: { fuelPrices: object } }>(alice, "select cost_defaults c from user_settings"))[0].c.fuelPrices).toBeTruthy();
    expect(await q(bob, "select cost_assumptions from trips")).toEqual([]);
  });
});
