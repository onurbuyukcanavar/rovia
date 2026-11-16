import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;
let trip: string;

/** Storage'a yüklenmiş dosyayı taklit eder (Supabase metadata: size, mimetype) */
async function upload(user: string, size = 400_000, mime = "image/webp") {
  const id = randomUUID();
  const path = `${user}/${id}.webp`;
  const thumb = `${user}/${id}_t.webp`;
  await db.query("insert into storage.objects (bucket_id, name, owner, metadata) values ('media', $1, $3, $4), ('media', $2, $3, $5)", [
    path, thumb, user, JSON.stringify({ size, mimetype: mime }), JSON.stringify({ size: 30_000, mimetype: mime }),
  ]);
  return { path, thumb_path: thumb, width: 2000, height: 1500 };
}

const register = (user: string, tripId: string | null, items: unknown[]) =>
  asUser(db, user, async (tx) =>
    (await tx.query<{ r: { i: number; id: string }[] }>("select media_register($1, $2::jsonb) r", [tripId, JSON.stringify(items)])).rows[0].r);

const saveNote = (user: string, args: {
  id?: string | null; trip?: string | null; kind?: string; title?: string | null; body?: string | null;
  lat?: number | null; lng?: number | null; media?: string[];
}) =>
  asUser(db, user, async (tx) =>
    (await tx.query<{ id: string }>(
      "select journal_note_save($1, $2, $3, $4, $5, null, $6, $7, $8, null, $9::uuid[]) id",
      [args.id ?? null, args.trip ?? null, args.kind ?? "note", args.title ?? null, args.body ?? null,
        args.lat != null ? "Kapadokya" : null, args.lat ?? null, args.lng ?? null, args.media ?? []],
    )).rows[0].id);

async function expectError(p: Promise<unknown>, pattern: RegExp) {
  await expect(p).rejects.toThrow(pattern);
}

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  bob = await createUser(db, { full_name: "Bob" });
  const t = await db.query<{ id: string }>(
    "insert into public.trips (user_id, title, status, started_at, completed_at) values ($1, 'Kapadokya turu', 'completed', '2026-10-01 08:00+03', '2026-10-01 18:00+03') returning id",
    [alice]);
  trip = t.rows[0].id;
  await db.query(
    `insert into public.trip_recordings (trip_id, user_id, status, started_at, ended_at, total_distance_m, moving_duration_s, elapsed_duration_s, start_label, end_label, simplified_polyline)
     values ($1, $2, 'completed', '2026-10-01 08:00+03', '2026-10-01 18:00+03', 312000, 20000, 36000, 'Ankara', 'Göreme', '_p~iF~ps|U_ulLnnqC')`,
    [trip, alice]);
}, 60_000);

describe("media_register", () => {
  it("yüklenmiş dosyayı doğrular; boyut ve tür Storage'dan alınır; geçersiz konum ve gelecek tarih atılır", async () => {
    const f = await upload(alice);
    const [r] = await register(alice, trip, [{ ...f, taken_at: "2026-10-01T10:00:00Z", lat: 38.64, lng: 34.83 }]);
    const g = await upload(alice);
    const [r2] = await register(alice, null, [{ ...g, taken_at: "2099-01-01T00:00:00Z", lat: 95, lng: 30 }]);
    const rows = await asUser(db, alice, async (tx) =>
      (await tx.query("select id, trip_id, mime_type, size_bytes, thumb_bytes, taken_at is not null as has_time, latitude, longitude from media_assets order by created_at")).rows);
    expect(rows).toEqual([
      { id: r.id, trip_id: trip, mime_type: "image/webp", size_bytes: 400_000, thumb_bytes: 30_000, has_time: true, latitude: 38.64, longitude: 34.83 },
      { id: r2.id, trip_id: null, mime_type: "image/webp", size_bytes: 400_000, thumb_bytes: 30_000, has_time: false, latitude: null, longitude: null },
    ]);
    // Aynı dosyanın tekrar kaydı yeni satır üretmez
    const [again] = await register(alice, trip, [f]);
    expect(again.id).toBe(r.id);
  });

  it("yüklenmemiş dosya, başkasının klasörü, biçimsiz yol ve izinsiz tür reddedilir", async () => {
    const id = randomUUID();
    await expectError(register(alice, null, [{ path: `${alice}/${id}.webp`, thumb_path: `${alice}/${id}_t.webp` }]), /upload_missing/);
    const a = await upload(alice);
    await expectError(register(bob, null, [a]), /invalid_path/);
    await expectError(register(alice, null, [{ ...a, path: `${alice}/../x.webp` }]), /invalid_path/);
    await expectError(register(alice, null, [{ path: a.thumb_path, thumb_path: a.path }]), /invalid_path/);
    const png = await upload(alice, 1000, "image/png");
    await expectError(register(alice, null, [png]), /invalid_type/);
  });

  it("başkasının yolculuğuna fotoğraf bağlanamaz; kota aşılamaz", async () => {
    const b = await upload(bob);
    await expectError(register(bob, trip, [b]), /trip_not_found/);
    const huge = await upload(bob, 20_000_000);
    const items = [huge];
    for (let i = 0; i < 15; i++) items.push(await upload(bob, 20_000_000));
    await expectError(register(bob, null, items), /quota_exceeded/);
    // İşlem bütün olarak geri alınır
    const n = await asUser(db, bob, async (tx) => (await tx.query("select count(*)::int n from media_assets")).rows[0]);
    expect(n).toEqual({ n: 0 });
  });
});

describe("journal_note_save", () => {
  it("not + fotoğraflar tek işlemde; sıralama korunur; fotoğraflar notun yolculuğuna bağlanır", async () => {
    const [m1] = await register(alice, null, [await upload(alice)]);
    const [m2] = await register(alice, null, [await upload(alice)]);
    const id = await saveNote(alice, { trip, kind: "memory", title: "Balonlar", body: "Gün doğumunda yüzlerce balon.", lat: 38.64, lng: 34.83, media: [m2.id, m1.id] });
    const links = await asUser(db, alice, async (tx) =>
      (await tx.query("select media_id, sort_order from journal_note_media where note_id = $1 order by sort_order", [id])).rows);
    expect(links).toEqual([{ media_id: m2.id, sort_order: 0 }, { media_id: m1.id, sort_order: 1 }]);
    const trips = await asUser(db, alice, async (tx) =>
      (await tx.query("select count(*)::int n from media_assets where id = any($1) and trip_id = $2", [[m1.id, m2.id], trip])).rows[0]);
    expect(trips).toEqual({ n: 2 });

    // Düzenleme: fotoğraf listesi yenilenir
    await saveNote(alice, { id, trip, kind: "memory", title: "Balonlar", body: "Güncellendi", media: [m1.id] });
    const after = await asUser(db, alice, async (tx) =>
      (await tx.query("select n.body, array_agg(l.media_id) m from journal_notes n join journal_note_media l on l.note_id = n.id where n.id = $1 group by n.body", [id])).rows);
    expect(after).toEqual([{ body: "Güncellendi", m: [m1.id] }]);
  });

  it("boş not, başkasının fotoğrafı, başkasının notu ve yarım konum reddedilir; yalnızca fotoğraflı not geçerli", async () => {
    await expectError(saveNote(alice, { title: "  ", body: "" }), /empty_note/);
    const [b] = await register(bob, null, [await upload(bob)]);
    await expectError(saveNote(alice, { title: "x", media: [b.id] }), /media_not_found/);
    const mine = await saveNote(alice, { title: "Alice notu" });
    await expectError(saveNote(bob, { id: mine, title: "ele geçir" }), /note_not_found/);
    await expectError(saveNote(alice, { title: "x", lat: 39 }), /invalid_location/);
    await expectError(saveNote(bob, { trip, title: "başkasının yolculuğu" }), /trip|owner|violates|permission|not found/i);
    const [m] = await register(alice, null, [await upload(alice)]);
    expect(await saveNote(alice, { media: [m.id] })).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("trip_archive, media_delete, trip_delete", () => {
  it("arşiv: özet, rota, fotoğraf ve not sayısı, kapak; başkası göremez", async () => {
    const [row] = await asUser(db, alice, async (tx) => (await tx.query<Record<string, unknown>>("select * from trip_archive()")).rows);
    expect(row).toMatchObject({ id: trip, title: "Kapadokya turu", distance_m: 312000, elapsed_s: 36000, start_label: "Ankara", end_label: "Göreme", note_count: 1 });
    expect(Number(row.photo_count)).toBeGreaterThanOrEqual(3);
    expect(String(row.cover_thumb)).toMatch(new RegExp(`^${alice}/.+_t\\.webp$`));
    expect(await asUser(db, bob, async (tx) => (await tx.query("select * from trip_archive()")).rows)).toEqual([]);
  });

  it("media_delete dosya yollarını döndürür, başkasının fotoğrafını silmez; not bağlantısı da silinir", async () => {
    const [m] = await register(alice, null, [await upload(alice)]);
    const note = await saveNote(alice, { title: "tek fotoğraf", media: [m.id] });
    const fromBob = await asUser(db, bob, async (tx) => (await tx.query<{ p: string[] }>("select media_delete($1) p", [[m.id]])).rows[0].p);
    expect(fromBob).toEqual([]);
    const paths = await asUser(db, alice, async (tx) => (await tx.query<{ p: string[] }>("select media_delete($1) p", [[m.id]])).rows[0].p);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.endsWith("_t.webp"))).toBe(true);
    const links = await asUser(db, alice, async (tx) => (await tx.query("select count(*)::int n from journal_note_media where note_id = $1", [note])).rows[0]);
    expect(links).toEqual({ n: 0 });
  });

  it("yolculuk silinirken günlük korunabilir ya da birlikte silinebilir", async () => {
    // Günlük korunur: notlar ve fotoğraflar yolculuktan ayrılır
    const t2 = (await db.query<{ id: string }>("insert into public.trips (user_id, title, status) values ($1, 'Kısa tur', 'completed') returning id", [alice])).rows[0].id;
    const [m] = await register(alice, t2, [await upload(alice)]);
    await saveNote(alice, { trip: t2, title: "kalacak" });
    const kept = await asUser(db, alice, async (tx) => (await tx.query<{ p: string[] }>("select trip_delete($1, false) p", [t2])).rows[0].p);
    expect(kept).toEqual([]);
    const left = await asUser(db, alice, async (tx) =>
      (await tx.query("select (select trip_id from media_assets where id = $1) m, (select trip_id from journal_notes where title = 'kalacak') n", [m.id])).rows[0]);
    expect(left).toEqual({ m: null, n: null });

    // Günlükle birlikte: dosya yolları döner, not ve fotoğraflar silinir
    const before = await asUser(db, alice, async (tx) => (await tx.query<{ n: number }>("select count(*)::int n from media_assets where trip_id = $1", [trip])).rows[0].n);
    await expectError(asUser(db, bob, (tx) => tx.query("select trip_delete($1, true)", [trip])), /trip_not_found/);
    const paths = await asUser(db, alice, async (tx) => (await tx.query<{ p: string[] }>("select trip_delete($1, true) p", [trip])).rows[0].p);
    expect(paths).toHaveLength(before * 2);
    const rest = await asUser(db, alice, async (tx) =>
      (await tx.query("select (select count(*)::int from trips where id = $1) t, (select count(*)::int from journal_notes where title = 'Balonlar') n", [trip])).rows[0]);
    expect(rest).toEqual({ t: 0, n: 0 });
  });

  it("hız sınırı kovaları tanımlı", async () => {
    const r = await asUser(db, alice, async (tx) =>
      (await tx.query("select consume_rate_limit('media') a, consume_rate_limit('journal') b")).rows[0]);
    expect(r).toEqual({ a: true, b: true });
  });
});
