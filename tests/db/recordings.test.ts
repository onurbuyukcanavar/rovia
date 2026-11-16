import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  bob = await createUser(db, { full_name: "Bob" });
}, 60_000);

// Sabit taban zaman: tekrar gönderilen noktalar aynı zaman damgasını taşımalı
const BASE = Math.floor((Date.now() - 3_600_000) / 1000) * 1000;
const iso = (offsetS: number) => new Date(BASE + offsetS * 1000).toISOString();
const ms = (offsetS: number) => BASE + offsetS * 1000;

function q<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  return asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
}

async function start(user: string, opts: { id?: string; seg?: string; tripId?: string | null; at?: string; title?: string | null } = {}) {
  const id = opts.id ?? randomUUID();
  const seg = opts.seg ?? randomUUID();
  const rows = await q<{ recording_id: string; trip_id: string; status: string }>(
    user, "select * from recording_start($1, $2, $3, $4, $5)",
    [id, seg, opts.at ?? iso(0), opts.tripId ?? null, opts.title ?? "Kapadokya turu"],
  );
  return { id, seg, trip: rows[0].trip_id, row: rows[0] };
}

const points = (from: number, n: number, lat0 = 40) =>
  JSON.stringify(Array.from({ length: n }, (_, i) => ({ t: ms(from + i), lat: lat0 + i * 0.0002, lng: 30, acc: 8, spd: 22, hdg: 0 })));

describe("kayıt yaşam döngüsü", () => {
  it("plansız kayıt: yolculuk oluşturur, noktalar idempotent eklenir, duraklat/devam/bitir", async () => {
    const r = await start(alice);
    expect(r.row.status).toBe("recording");
    const [trip] = await q(alice, "select title, status, started_at from trips where id = $1", [r.trip]);
    expect(trip).toMatchObject({ title: "Kapadokya turu", status: "active" });

    // Tekrar gönderim aynı kaydı döndürür, ikinci yolculuk oluşmaz
    const again = await start(alice, { id: r.id, seg: r.seg });
    expect(again.trip).toBe(r.trip);

    expect((await q<{ n: number }>(alice, "select recording_add_points($1, $2, $3::jsonb) n", [r.id, r.seg, points(1, 50)]))[0].n).toBe(50);
    expect((await q<{ n: number }>(alice, "select recording_add_points($1, $2, $3::jsonb) n", [r.id, r.seg, points(1, 60)]))[0].n).toBe(10);

    expect((await q<{ s: string }>(alice, "select recording_pause($1, $2, $3) s", [r.id, r.seg, iso(100)]))[0].s).toBe("paused");
    expect((await q<{ s: string }>(alice, "select recording_pause($1, $2, $3) s", [r.id, r.seg, iso(100)]))[0].s).toBe("paused");

    const seg2 = randomUUID();
    expect((await q<{ s: string }>(alice, "select recording_resume($1, $2, $3) s", [r.id, seg2, iso(400)]))[0].s).toBe("recording");
    expect((await q<{ s: string }>(alice, "select recording_resume($1, $2, $3) s", [r.id, seg2, iso(400)]))[0].s).toBe("recording");
    await q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, seg2, points(401, 30, 40.05)]);

    expect((await q<{ s: string }>(alice, "select recording_finish($1, $2) s", [r.id, iso(500)]))[0].s).toBe("completed");
    expect((await q<{ s: string }>(alice, "select recording_finish($1, $2) s", [r.id, iso(500)]))[0].s).toBe("completed");

    const segs = await q<{ end_reason: string; ended_at: string }>(alice, "select end_reason, ended_at from recording_segments where recording_id = $1 order by started_at", [r.id]);
    expect(segs.map((s) => s.end_reason)).toEqual(["pause", "complete"]);
    const [rec] = await q<{ status: string; elapsed_duration_s: number }>(alice, "select status, elapsed_duration_s from trip_recordings where id = $1", [r.id]);
    expect(rec).toEqual({ status: "completed", elapsed_duration_s: 500 });
    const [trip2] = await q(alice, "select status, completed_at is not null as done from trips where id = $1", [r.trip]);
    expect(trip2).toEqual({ status: "completed", done: true });
    expect(Number((await q<{ n: string }>(alice, "select count(*) n from gps_points where recording_id = $1", [r.id]))[0].n)).toBe(90);

    // Tek çağrıda tüm iz: bölümler sırayla, noktalar kompakt
    const [{ track }] = await q<{ track: { status: string; segments: { id: string; points: number[][] }[] } }>(
      alice, "select recording_track($1) track", [r.id]);
    expect(track.status).toBe("completed");
    expect(track.segments.map((s) => s.id)).toEqual([r.seg, seg2]);
    expect(track.segments.map((s) => s.points.length)).toEqual([60, 30]);
    expect(track.segments[0].points[0]).toEqual([ms(1), 40, 30, 8, 22]);
    expect(await q(bob, "select recording_track($1) track", [r.id])).toEqual([{ track: null }]);

    // Tamamlanmış kayda nokta eklenemez, iptal edilemez
    await expect(q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, seg2, points(600, 1)])).rejects.toThrow(/recording_closed/);
    await expect(q(alice, "select recording_cancel($1)", [r.id])).rejects.toThrow(/recording_closed/);
  });

  it("bitiş zamanı son noktadan önce olamaz (cihaz saati kayması)", async () => {
    const r = await start(alice);
    await q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, r.seg, points(10, 20)]);
    await q(alice, "select recording_finish($1, $2)", [r.id, iso(5)]);
    const [rec] = await q<{ elapsed_duration_s: number }>(alice, "select elapsed_duration_s from trip_recordings where id = $1", [r.id]);
    expect(rec.elapsed_duration_s).toBe(29);
  });

  it("aynı anda tek aktif kayıt", async () => {
    const r = await start(alice);
    await expect(start(alice)).rejects.toThrow(/recording_active/);
    // Hatalı başlatma yarım yolculuk bırakmaz
    expect(Number((await q<{ n: string }>(alice, "select count(*) n from trips where status = 'active'"))[0].n)).toBe(1);
    await q(alice, "select recording_cancel($1)", [r.id]);
  });

  it("iptal: plansız yolculuk silinir; planlı yolculuk yeniden 'planned' olur; tekrar gönderim sorunsuz", async () => {
    const r = await start(alice);
    await q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, r.seg, points(1, 5)]);
    expect((await q<{ s: string }>(alice, "select recording_cancel($1) s", [r.id]))[0].s).toBe("cancelled");
    expect(await q(alice, "select id from trips where id = $1", [r.trip])).toEqual([]);
    expect(await q(alice, "select id from gps_points where recording_id = $1", [r.id])).toEqual([]);
    expect((await q<{ s: string }>(alice, "select recording_cancel($1) s", [r.id]))[0].s).toBe("cancelled");

    const [planned] = await q<{ trip_id: string }>(alice,
      `select * from save_trip_plan(null, null, 'Planlı', null, null,
        '[{"name":"A","lat":41,"lng":29},{"name":"B","lat":39.9,"lng":32.8}]'::jsonb, null)`);
    const p = await start(alice, { tripId: planned.trip_id });
    expect(p.trip).toBe(planned.trip_id);
    expect((await q<{ status: string }>(alice, "select status from trips where id = $1", [planned.trip_id]))[0].status).toBe("active");
    // Başlamış planın planı değiştirilemez
    await expect(q(alice, `select * from save_trip_plan($1, 2, 'x', null, null,
        '[{"name":"A","lat":41,"lng":29},{"name":"B","lat":39.9,"lng":32.8}]'::jsonb, null)`, [planned.trip_id])).rejects.toThrow(/trip_not_editable/);
    await q(alice, "select recording_cancel($1)", [p.id]);
    expect((await q<{ status: string; started_at: string | null }>(alice, "select status, started_at from trips where id = $1", [planned.trip_id]))[0])
      .toEqual({ status: "planned", started_at: null });
  });

  it("tamamlanmış planlı yolculuk yeniden başlatılamaz", async () => {
    const [planned] = await q<{ trip_id: string }>(alice,
      `select * from save_trip_plan(null, null, 'Bitti', null, null,
        '[{"name":"A","lat":41,"lng":29},{"name":"B","lat":39.9,"lng":32.8}]'::jsonb, null)`);
    const r = await start(alice, { tripId: planned.trip_id });
    await q(alice, "select recording_finish($1, $2)", [r.id, iso(60)]);
    await expect(start(alice, { tripId: planned.trip_id })).rejects.toThrow(/trip_not_startable/);
  });
});

describe("yetki ve doğrulama", () => {
  it("başkasının kaydına ve yolculuğuna erişilemez", async () => {
    const r = await start(alice);
    await expect(q(bob, "select recording_add_points($1, $2, $3::jsonb)", [r.id, r.seg, points(1, 3)])).rejects.toThrow(/recording_not_found/);
    await expect(q(bob, "select recording_pause($1, $2, $3)", [r.id, r.seg, iso(5)])).rejects.toThrow(/recording_not_found/);
    await expect(q(bob, "select recording_finish($1, $2)", [r.id, iso(5)])).rejects.toThrow(/recording_not_found/);
    // Bob'un iptali Alice'in kaydını silmez
    await q(bob, "select recording_cancel($1)", [r.id]);
    expect(await q(alice, "select id from trip_recordings where id = $1", [r.id])).toHaveLength(1);
    // Bob, Alice'in kayıt kimliğiyle kayıt başlatamaz; Alice'in yolculuğunu başlatamaz
    await expect(start(bob, { id: r.id })).rejects.toThrow();
    await expect(start(bob, { tripId: r.trip })).rejects.toThrow(/trip_not_found/);
    // Bob, kendi kaydına Alice'in bölümünü kullanarak nokta ekleyemez
    const b = await start(bob);
    await expect(q(bob, "select recording_add_points($1, $2, $3::jsonb)", [b.id, r.seg, points(1, 3)])).rejects.toThrow(/segment_not_found/);
    await q(bob, "select recording_cancel($1)", [b.id]);
    await q(alice, "select recording_cancel($1)", [r.id]);
  });

  it("zaman ve girdi doğrulaması; anonim erişim yok", async () => {
    await expect(start(alice, { at: new Date(Date.now() + 3_600_000).toISOString() })).rejects.toThrow(/invalid_time/);
    await expect(start(alice, { at: new Date(Date.now() - 40 * 86_400_000).toISOString() })).rejects.toThrow(/invalid_time/);
    const r = await start(alice);
    await expect(q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, r.seg, JSON.stringify({ a: 1 })])).rejects.toThrow(/invalid_points/);
    const big = JSON.stringify(Array.from({ length: 1001 }, (_, i) => ({ t: ms(i), lat: 40, lng: 30 })));
    await expect(q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, r.seg, big])).rejects.toThrow(/invalid_points/);
    // Geçersiz değerler temizlenir: negatif hız/doğruluk ve 360° yön null olur, kapsam dışı koordinat atlanır
    const n = await q<{ n: number }>(alice, "select recording_add_points($1, $2, $3::jsonb) n", [r.id, r.seg,
      JSON.stringify([{ t: ms(1), lat: 40, lng: 30, acc: -1, spd: -2, hdg: 360 }, { t: ms(2), lat: 95, lng: 30 }])]);
    expect(n[0].n).toBe(1);
    const [pt] = await q(alice, "select accuracy_m, speed_mps, heading_deg from gps_points where recording_id = $1", [r.id]);
    expect(pt).toEqual({ accuracy_m: null, speed_mps: null, heading_deg: null });
    await q(alice, "select recording_cancel($1)", [r.id]);

    await expect(q(null, "select * from recording_start($1, $2, now(), null, 'x')", [randomUUID(), randomUUID()])).rejects.toThrow(/permission denied/);
  });
});

describe("ham GPS saklama süresi", () => {
  it("süresi dolan tamamlanmış kayıtların noktaları silinir; özet kalır; süresiz ayar korunur", async () => {
    const r = await start(alice);
    await q(alice, "select recording_add_points($1, $2, $3::jsonb)", [r.id, r.seg, points(1, 10)]);
    await q(alice, "select recording_finish($1, $2)", [r.id, iso(20)]);
    const b = await start(bob);
    await q(bob, "select recording_add_points($1, $2, $3::jsonb)", [b.id, b.seg, points(1, 10)]);
    await q(bob, "select recording_finish($1, $2)", [b.id, iso(20)]);

    // Özet yazılmadan silinmez
    await db.exec("update user_settings set gps_raw_retention_days = 0");
    expect((await db.query<{ n: number }>("select public.purge_expired_gps_points() n")).rows[0].n).toBe(0);

    await db.query("update trip_recordings set simplified_polyline = 'abc', total_distance_m = 1234 where id = any($1)", [[r.id, b.id]]);
    await db.query("update user_settings set gps_raw_retention_days = null where user_id = $1", [bob]);
    const purged = (await db.query<{ n: number }>("select public.purge_expired_gps_points() n")).rows[0].n;
    expect(purged).toBeGreaterThanOrEqual(10);
    expect(await q(alice, "select id from gps_points where recording_id = $1", [r.id])).toEqual([]);
    expect((await q<{ total_distance_m: string }>(alice, "select total_distance_m from trip_recordings where id = $1", [r.id]))[0].total_distance_m).toBe("1234.0");
    expect(await q(bob, "select id from gps_points where recording_id = $1", [b.id])).toHaveLength(10);

    // Kullanıcılar temizleme fonksiyonunu çağıramaz
    await expect(q(alice, "select public.purge_expired_gps_points()")).rejects.toThrow(/permission denied/);
  });

  it("'gps' hız sınırı kovası tanımlı", async () => {
    const [r] = await q<{ ok: boolean }>(alice, "select consume_rate_limit('gps') ok");
    expect(r.ok).toBe(true);
  });
});
