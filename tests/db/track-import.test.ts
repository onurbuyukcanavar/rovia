import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";
import { encodePolyline } from "@/lib/geo";

let db: TestDb;
let alice: string;
let bob: string;

type Row = Record<string, unknown>;
const q = <T = Row>(user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);

const line = [{ lat: 38.643, lng: 34.828 }, { lat: 38.64, lng: 34.82 }, { lat: 38.63, lng: 34.805 }];
const poly = encodePolyline(line);
const stops = JSON.stringify([{ name: "Göreme", lat: 38.643, lng: 34.828 }, { name: "Uçhisar", lat: 38.63, lng: 34.805 }]);
const legs = JSON.stringify([{ d: 2600, s: 160 }]);
const start = new Date(Date.now() - 3 * 3600_000).toISOString();
const end = new Date(Date.now() - 2 * 3600_000).toISOString();

const SQL = "select trip_import_track($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12) id";
type Args = [string | null, string | null, string, string, number, string | null, string | null, number | null, number | null, string, string | null, string];
const rec = (over: Partial<Record<number, unknown>> = {}): Args => {
  const a: Args = [null, "İçe GPX", "recording", poly, 2600, start, end, 3000, 50, stops, null, "gpx"];
  for (const [k, v] of Object.entries(over)) (a as unknown[])[Number(k)] = v;
  return a;
};
const route = (over: Partial<Record<number, unknown>> = {}): Args => {
  const a: Args = [null, "İçe KML", "route", poly, 2600, null, null, null, null, stops, legs, "kml"];
  for (const [k, v] of Object.entries(over)) (a as unknown[])[Number(k)] = v;
  return a;
};
const run = async (user: string, args: Args) => (await q<{ id: string }>(user, SQL, args))[0].id;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
}, 60_000);

describe("trip_import_track", () => {
  it("zaman damgalı iz → tamamlanmış yolculuk + tamamlanmış kayıt + duraklar", async () => {
    const id = await run(alice, rec());
    const [trip] = await q(alice, "select status, title, started_at, completed_at from trips where id = $1", [id]);
    expect(trip.status).toBe("completed");
    expect(trip.title).toBe("İçe GPX");
    const [r] = await q(alice,
      "select status, source, total_distance_m::float d, elapsed_duration_s, moving_duration_s, average_speed_kmh::float avg, start_label, end_label, simplified_polyline, point_count from trip_recordings where trip_id = $1", [id]);
    expect(r).toMatchObject({ status: "completed", source: "gpx", d: 2600, elapsed_duration_s: 3600, moving_duration_s: 3000, start_label: "Göreme", end_label: "Uçhisar", simplified_polyline: poly, point_count: 50 });
    expect(r.avg).toBeCloseTo(3.12, 2);
    const s = await q(alice, "select kind, name from trip_stops where trip_id = $1 order by stop_order", [id]);
    expect(s.map((x) => x.kind)).toEqual(["origin", "destination"]);
    // Ham nokta saklanmaz
    expect((await q(alice, "select count(*)::int n from gps_points"))[0].n).toBe(0);
  });

  it("zamansız iz → planlı yolculuk, rota ve bacaklar", async () => {
    const id = await run(alice, route());
    const [trip] = await q(alice, "select status, route_polyline, route_distance_m, route_duration_s, route_legs from trips where id = $1", [id]);
    expect(trip).toMatchObject({ status: "planned", route_polyline: poly, route_distance_m: 2600, route_duration_s: 160, route_legs: [{ d: 2600, s: 160 }] });
    expect((await q(alice, "select count(*)::int n from trip_recordings where trip_id = $1", [id]))[0].n).toBe(0);
  });

  it("mevcut planlı yolculuğa kayıt eklenir ve yolculuk tamamlanır; ikinci kayıt reddedilir", async () => {
    const [{ id: planned }] = await q<{ id: string }>(alice, "insert into trips (user_id, title) values ($1, 'Plan') returning id", [alice]);
    await q(alice, "insert into trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values ($1, $2, 'origin', 0, 'A', 39, 32), ($1, $2, 'destination', 1, 'B', 39.1, 32.1)", [planned, alice]);
    expect(await run(alice, rec({ 0: planned }))).toBe(planned);
    expect((await q(alice, "select status from trips where id = $1", [planned]))[0].status).toBe("completed");
    // Duraklarına dokunulmaz
    expect((await q(alice, "select string_agg(name, ',' order by stop_order) n from trip_stops where trip_id = $1", [planned]))[0].n).toBe("A,B");
    await expect(run(alice, rec({ 0: planned }))).rejects.toThrow(/trip_has_recording/);
  });

  it("planlı yolculuğun rotası ve durakları değiştirilir; tamamlanmışa rota yazılamaz", async () => {
    const [{ id: planned }] = await q<{ id: string }>(alice, "insert into trips (user_id, title) values ($1, 'Plan 2') returning id", [alice]);
    await q(alice, "insert into trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values ($1, $2, 'origin', 0, 'X', 39, 32), ($1, $2, 'waypoint', 1, 'Y', 39, 32.05), ($1, $2, 'destination', 2, 'Z', 39.1, 32.1)", [planned, alice]);
    await run(alice, route({ 0: planned }));
    expect((await q(alice, "select string_agg(name, ',' order by stop_order) n from trip_stops where trip_id = $1", [planned]))[0].n).toBe("Göreme,Uçhisar");
    const completed = await run(alice, rec());
    await expect(run(alice, route({ 0: completed }))).rejects.toThrow(/trip_not_editable/);
  });

  it("aktif yolculuğa eklenemez", async () => {
    const [{ id }] = await q<{ id: string }>(alice, "insert into trips (user_id, title, status) values ($1, 'Şimdi', 'active') returning id", [alice]);
    await expect(run(alice, rec({ 0: id }))).rejects.toThrow(/trip_active/);
  });

  it("başkasının yolculuğu görünmez (RLS)", async () => {
    const [{ id }] = await q<{ id: string }>(alice, "insert into trips (user_id, title) values ($1, 'Gizli') returning id", [alice]);
    await expect(run(bob, rec({ 0: id }))).rejects.toThrow(/trip_not_found/);
    await expect(run(bob, route({ 0: id }))).rejects.toThrow(/trip_not_found/);
  });

  it("doğrulama: mod, kaynak, iz, zaman, hız, duraklar, bacaklar", async () => {
    await expect(run(alice, rec({ 2: "hack" }))).rejects.toThrow(/invalid_request/);
    await expect(run(alice, rec({ 11: "csv" }))).rejects.toThrow(/invalid_request/);
    await expect(run(alice, rec({ 3: "<script>" }))).rejects.toThrow(/invalid_track/);
    await expect(run(alice, rec({ 3: "a".repeat(200001) }))).rejects.toThrow(/invalid_track/);
    await expect(run(alice, route({ 3: `${poly} ${poly}` }))).rejects.toThrow(/invalid_track/);
    await expect(run(alice, rec({ 4: -1 }))).rejects.toThrow(/invalid_track/);
    await expect(run(alice, rec({ 6: null }))).rejects.toThrow(/invalid_time/);
    await expect(run(alice, rec({ 5: end, 6: start }))).rejects.toThrow(/invalid_time/);
    await expect(run(alice, rec({ 6: new Date(Date.now() + 3 * 86400_000).toISOString() }))).rejects.toThrow(/invalid_time/);
    await expect(run(alice, rec({ 4: 5_000_000 }))).rejects.toThrow(/invalid_track/); // 5000 km/sa
    await expect(run(alice, rec({ 8: 1 }))).rejects.toThrow(/invalid_track/);
    await expect(run(alice, rec({ 9: JSON.stringify([{ name: "A", lat: 1, lng: 2 }]) }))).rejects.toThrow(/invalid_stops/);
    await expect(run(alice, rec({ 9: JSON.stringify([{ name: "A", lat: 91, lng: 2 }, { name: "B", lat: 1, lng: 2 }]) }))).rejects.toThrow(/invalid_stops/);
    await expect(run(alice, rec({ 9: JSON.stringify([{ name: "A", lat: "x", lng: 2 }, { name: "B", lat: 1, lng: 2 }]) }))).rejects.toThrow(/invalid_stops/);
    await expect(run(alice, rec({ 9: JSON.stringify([{ name: " ", lat: 1, lng: 2 }, { name: "B", lat: 1, lng: 2 }]) }))).rejects.toThrow(/invalid_stops/);
    const many = JSON.stringify(Array.from({ length: 21 }, (_, i) => ({ name: `S${i}`, lat: 39, lng: 32 + i / 100 })));
    await expect(run(alice, rec({ 9: many }))).rejects.toThrow(/invalid_stops/);
    await expect(run(alice, route({ 10: null }))).rejects.toThrow(/invalid_route/);
    await expect(run(alice, route({ 10: JSON.stringify([{ d: 1, s: 1 }, { d: 1, s: 1 }]) }))).rejects.toThrow(/invalid_route/);
    await expect(run(alice, route({ 10: JSON.stringify([{ d: "x", s: 1 }]) }))).rejects.toThrow(/invalid_route/);
  });

  it("oturumsuz ve anon çağrı reddedilir", async () => {
    await expect(db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      return tx.query(SQL, rec());
    })).rejects.toThrow(/permission denied/);
  });
});
