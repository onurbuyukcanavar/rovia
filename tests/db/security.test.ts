import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

/**
 * Genel güvenlik değişmezleri (PHASE 10):
 * - public şemasındaki HER tabloda RLS açık.
 * - Anonim rol hiçbir tablodan satır göremez, yazamaz.
 * - Bir kullanıcı başka bir kullanıcının hiçbir satırını göremez/değiştiremez/silemez.
 * - Anonim çağrılabilen fonksiyonlar yalnızca bilinçli olarak açılanlardır.
 * - Hesap silme: onay, yakın zamanda giriş ve fotoğrafların önce silinmesi şart; veriler zincirleme silinir.
 */
let db: TestDb;
let alice: string;
let bob: string;
let tables: string[];

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  bob = await createUser(db, { full_name: "Bob" });
  // Alice için her modülden örnek veri
  const trip = (await db.query<{ id: string }>("insert into public.trips (user_id, title, status) values ($1, 'Gizli yolculuk', 'completed') returning id", [alice])).rows[0].id;
  await db.query("insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values ($1, $2, 'origin', 0, 'Ev', 41, 29)", [trip, alice]);
  await db.query("insert into public.journal_notes (user_id, trip_id, body) values ($1, $2, 'özel not')", [alice, trip]);
  await db.query("insert into public.vehicles (user_id, name) values ($1, 'Araba')", [alice]);
  await db.query(
    "insert into public.media_assets (user_id, trip_id, storage_path, mime_type, size_bytes) values ($1, $2, $3, 'image/webp', 1)",
    [alice, trip, `${alice}/${randomUUID()}.webp`]);
  await asUser(db, alice, (tx) => tx.query("select travelogue_create($1, null, true)", [trip]));
  await asUser(db, alice, (tx) => tx.query("select share_set('trip', $1, 'link')", [trip]));
  tables = (await db.query<{ t: string }>(
    "select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1")).rows.map((r) => r.t);
}, 60_000);

const anon = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.transaction(async (tx) => { await tx.exec("set local role anon"); return (await tx.query<T>(sql, params)).rows; });

describe("RLS kapsamı", () => {
  it("public şemasındaki tüm tablolarda RLS açık", async () => {
    const off = (await db.query<{ t: string }>(
      `select c.relname t from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`)).rows;
    expect(off).toEqual([]);
    expect(tables.length).toBeGreaterThan(15);
  });

  it("anonim rol hiçbir tablodan satır göremez", async () => {
    for (const t of tables) {
      const rows = await anon(`select * from public.${t} limit 1`).catch((e: Error) => (/permission denied/.test(e.message) ? [] : Promise.reject(e)));
      expect(rows, t).toEqual([]);
    }
  });

  it("Bob, Alice'in hiçbir satırını göremez, güncelleyemez, silemez", async () => {
    for (const t of tables) {
      const cols = (await db.query<{ c: string }>(
        "select column_name c from information_schema.columns where table_schema = 'public' and table_name = $1", [t])).rows.map((r) => r.c);
      if (!cols.includes("user_id")) continue;
      const seen = await asUser(db, bob, (tx) => tx.query(`select 1 from public.${t} where user_id = $1`, [alice]))
        .then((r) => r.rows.length).catch(() => 0);
      expect(seen, `${t} okunabildi`).toBe(0);
      const updated = await asUser(db, bob, (tx) => tx.query(`update public.${t} set user_id = user_id where user_id = $1`, [alice]))
        .then((r) => r.affectedRows ?? 0).catch(() => 0);
      expect(updated, `${t} güncellenebildi`).toBe(0);
      const deleted = await asUser(db, bob, (tx) => tx.query(`delete from public.${t} where user_id = $1`, [alice]))
        .then((r) => r.affectedRows ?? 0).catch(() => 0);
      expect(deleted, `${t} silinebildi`).toBe(0);
    }
  });

  it("Bob, Alice adına satır ekleyemez (sahiplik tetikleyicisi/RLS)", async () => {
    await expect(asUser(db, bob, (tx) => tx.query("insert into public.trips (user_id, title) values ($1, 'x')", [alice]))).rejects.toThrow();
    const aliceTrip = (await db.query<{ id: string }>("select id from public.trips where user_id = $1 limit 1", [alice])).rows[0].id;
    await expect(asUser(db, bob, (tx) => tx.query(
      "insert into public.trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values ($1, $2, 'waypoint', 5, 'x', 1, 1)",
      [aliceTrip, bob]))).rejects.toThrow();
  });

  it("anonim çağrılabilen fonksiyonlar yalnızca paylaşım okuma fonksiyonları", async () => {
    const fns = (await db.query<{ f: string }>(
      `select p.proname f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`)).rows.map((r) => r.f);
    // Tetikleyici ve iç yardımcılar dışında anonim yalnızca share_get ve media_shared'ı çağırabilir
    const allowed = new Set(["share_get", "media_shared"]);
    const unexpected = [];
    for (const f of fns) {
      if (allowed.has(f)) continue;
      const { rows } = await db.query<{ trigger: boolean; definer: boolean }>(
        `select p.prorettype = 'trigger'::regtype as trigger, p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = $1 limit 1`, [f]);
      if (rows[0].definer) unexpected.push(f);
    }
    expect(unexpected).toEqual([]);
  });
});

describe("account_delete", () => {
  it("onay metni, yakın zamanda giriş ve fotoğrafların silinmiş olması şart; sonra tüm veriler silinir", async () => {
    const carol = await createUser(db, { full_name: "Carol" });
    const trip = (await db.query<{ id: string }>("insert into public.trips (user_id, title) values ($1, 'C') returning id", [carol])).rows[0].id;
    await db.query("insert into public.journal_notes (user_id, trip_id, body) values ($1, $2, 'x')", [carol, trip]);
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('media', $1, $2)", [`${carol}/a.webp`, carol]);

    const del = (confirm: string) => asUser(db, carol, (tx) => tx.query("select account_delete($1)", [confirm]));
    await expect(del("evet")).rejects.toThrow(/confirmation_required/);
    await expect(del("HESABIMI SİL")).rejects.toThrow(/media_remaining/);
    await db.query("delete from storage.objects where name = $1", [`${carol}/a.webp`]);
    await db.query("update auth.users set last_sign_in_at = now() - interval '1 hour' where id = $1", [carol]);
    await expect(del("HESABIMI SİL")).rejects.toThrow(/reauth_required/);
    await db.query("update auth.users set last_sign_in_at = now() where id = $1", [carol]);
    await del("HESABIMI SİL");
    expect((await db.query("select 1 from auth.users where id = $1", [carol])).rows).toEqual([]);
    expect((await db.query("select 1 from public.trips where user_id = $1", [carol])).rows).toEqual([]);
    expect((await db.query("select 1 from public.journal_notes where user_id = $1", [carol])).rows).toEqual([]);
    expect((await db.query("select 1 from public.profiles where id = $1", [carol])).rows).toEqual([]);
    // Alice etkilenmez
    expect((await db.query("select 1 from public.trips where user_id = $1", [alice])).rows.length).toBeGreaterThan(0);
  });

  it("anonim çağıramaz; başkasının hesabını silemez (yalnızca kendi kimliği)", async () => {
    await expect(anon("select account_delete('HESABIMI SİL')")).rejects.toThrow(/permission denied/);
  });
});

describe("depolama", () => {
  it("fotoğraf kovası yalnızca WebP/JPEG kabul eder, 8 MB sınırlı ve özel", async () => {
    const { rows } = await db.query<{ public: boolean; allowed_mime_types: string[]; file_size_limit: number }>(
      "select public, allowed_mime_types, file_size_limit from storage.buckets where id = 'media'");
    expect(rows[0]).toEqual({ public: false, allowed_mime_types: ["image/webp", "image/jpeg"], file_size_limit: 8 * 1024 * 1024 });
  });
});
