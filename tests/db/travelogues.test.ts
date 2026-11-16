import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;
let trip: string;
let media: string[];

const q = <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, async (tx) => (await tx.query<T>(sql, params)).rows);
const one = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0];

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  bob = await createUser(db, { full_name: "Bob" });
  trip = (await db.query<{ id: string }>(
    "insert into public.trips (user_id, title, status) values ($1, 'Kapadokya turu', 'completed') returning id", [alice])).rows[0].id;
  media = [];
  for (let i = 0; i < 3; i++) {
    const id = randomUUID();
    const r = await db.query<{ id: string }>(
      "insert into public.media_assets (user_id, trip_id, storage_path, thumb_path, mime_type, size_bytes) values ($1, $2, $3, $4, 'image/webp', 1000) returning id",
      [alice, i === 2 ? null : trip, `${alice}/${id}.webp`, `${alice}/${id}_t.webp`]);
    media.push(r.rows[0].id);
  }
  const note = (await db.query<{ id: string }>(
    `insert into public.journal_notes (user_id, trip_id, kind, title, body, noted_at, location_name, latitude, longitude)
     values ($1, $2, 'visit', 'Göreme', E'Balonlar havadaydı.\n\nSabah çok soğuktu.', '2026-10-01 07:00+03', 'Göreme', 38.64, 34.83) returning id`,
    [alice, trip])).rows[0].id;
  await db.query("insert into public.journal_note_media (note_id, media_id, user_id, sort_order) values ($1, $2, $3, 0)", [note, media[0], alice]);
  await db.query(
    "insert into public.journal_notes (user_id, trip_id, kind, body, noted_at) values ($1, $2, 'note', 'Yola çıktık', '2026-10-01 06:00+03')",
    [alice, trip]);
}, 60_000);

describe("travelogue_create", () => {
  it("bölümleri oluşturur, günlük notlarını yazıya aktarır, fotoğrafları kopyalamadan bağlar; ikinci çağrı aynı kaydı döndürür", async () => {
    const { id } = await one<{ id: string }>(alice, "select travelogue_create($1, null, true) id", [trip]);
    const v = await one(alice, "select title, ordering, status, version from travelogues where id = $1", [id]);
    expect(v).toEqual({ title: "Kapadokya turu", ordering: "chronological", status: "draft", version: 1 });
    const sections = await q<{ kind: string }>(alice, "select kind from travelogue_sections where travelogue_id = $1 order by sort_order", [id]);
    expect(sections.map((s) => s.kind)).toEqual(
      ["cover", "introduction", "trip_info", "map", "chronicle", "places", "gallery", "evaluation", "epilogue"]);
    const entries = await q(alice,
      "select entry_type, title, content_text, location_name, narrative from travelogue_entries where travelogue_id = $1 order by visited_at", [id]);
    expect(entries.map((e) => [e.entry_type, e.title, e.location_name])).toEqual([["chronicle", "", null], ["place", "Göreme", "Göreme"]]);
    expect(entries[1].narrative).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Balonlar havadaydı." }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "Sabah çok soğuktu." }] },
      ],
    });
    const links = await q(alice, "select media_id from travelogue_entry_media");
    expect(links).toEqual([{ media_id: media[0] }]);
    expect((await one<{ c: number }>(alice, "select count(*)::int c from media_assets")).c).toBe(3);

    const again = await one<{ id: string }>(alice, "select travelogue_create($1, 'Başka', true) id", [trip]);
    expect(again.id).toBe(id);
  });

  it("yolculuksuz seyahatname başlık ister; başkasının yolculuğu bulunamaz", async () => {
    await expect(one(alice, "select travelogue_create(null, '  ', false)")).rejects.toThrow(/title_required/);
    await expect(one(bob, "select travelogue_create($1, 'x', false)", [trip])).rejects.toThrow(/trip_not_found/);
    const r = await one<{ id: string }>(alice, "select travelogue_create(null, 'Ege kıyıları', false) id");
    expect((await one<{ c: number }>(alice, "select count(*)::int c from travelogue_entries where travelogue_id = $1", [r.id])).c).toBe(0);
  });
});

describe("otomatik kayıt ve sürüm denetimi", () => {
  let tv: string;
  let entry: string;
  beforeAll(async () => {
    tv = (await one<{ id: string }>(alice, "select travelogue_create(null, 'Karadeniz', false) id")).id;
    entry = (await one<{ id: string }>(alice,
      "select travelogue_entry_create($1, $2::jsonb) id",
      [tv, JSON.stringify({ title: "Uzungöl", lat: 40.6, lng: 40.29, location_name: "Uzungöl", tags: ["doğa"] })])).id;
  });

  it("yazı oluşturulur; tür konumdan çıkarılır; eksik koordinat reddedilir", async () => {
    const e = await one(alice, "select entry_type, tags, version, sort_order from travelogue_entries where id = $1", [entry]);
    expect(e).toEqual({ entry_type: "place", tags: ["doğa"], version: 1, sort_order: 0 });
    await expect(one(alice, "select travelogue_entry_create($1, '{\"lat\": 40}'::jsonb)", [tv])).rejects.toThrow(/invalid_location/);
  });

  it("doğru sürümle kayıt sürümü artırır, eski hâli geçmişe ekler; eski sürümle kayıt çakışma verir, zorla kayıt geçer", async () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Göl sisliydi." }] }] };
    const r = await one<{ r: { version: number } }>(alice, "select travelogue_entry_save($1, 1, $2::jsonb) r",
      [entry, JSON.stringify({ narrative: doc, content_text: "Göl sisliydi.", visited_at: "2026-09-02T09:00:00Z" })]);
    expect(r.r.version).toBe(2);
    const e = await one(alice, "select narrative, content_text, title, version from travelogue_entries where id = $1", [entry]);
    expect(e).toEqual({ narrative: doc, content_text: "Göl sisliydi.", title: "Uzungöl", version: 2 });
    expect((await one<{ c: number }>(alice, "select count(*)::int c from travelogue_entry_revisions where entry_id = $1", [entry])).c).toBe(1);

    await expect(one(alice, "select travelogue_entry_save($1, 1, '{\"title\": \"Eski\"}'::jsonb)", [entry])).rejects.toThrow(/version_conflict/);
    const forced = await one<{ r: { version: number } }>(alice, "select travelogue_entry_save($1, 1, '{\"title\": \"Yeni\"}'::jsonb, true) r", [entry]);
    expect(forced.r.version).toBe(3);
    // 15 dakika içinde ikinci anlık görüntü alınmaz
    expect((await one<{ c: number }>(alice, "select count(*)::int c from travelogue_entry_revisions where entry_id = $1", [entry])).c).toBe(1);
  });

  it("izinsiz alan ve başkasının yazısı reddedilir; geçmiş değiştirilemez", async () => {
    await expect(one(alice, "select travelogue_entry_save($1, 3, '{\"user_id\": \"x\"}'::jsonb)", [entry])).rejects.toThrow(/invalid_patch/);
    await expect(one(bob, "select travelogue_entry_save($1, 3, '{\"title\": \"x\"}'::jsonb)", [entry])).rejects.toThrow(/entry_not_found/);
    await q(alice, "update travelogue_entry_revisions set snapshot = '{}'::jsonb where entry_id = $1", [entry]);
    const snap = await one<{ s: Record<string, unknown> }>(alice, "select snapshot s from travelogue_entry_revisions where entry_id = $1", [entry]);
    expect(snap.s.title).toBe("Uzungöl");
    expect(await q(bob, "select * from travelogue_entries")).toEqual([]);
  });

  it("seyahatname ve bölüm kaydı da sürüm denetimli; boş başlık kabul edilmez", async () => {
    const r = await one<{ r: { version: number } }>(alice, "select travelogue_save($1, 1, '{\"subtitle\": \"Yaylalar\", \"cover_media_id\": null}'::jsonb) r", [tv]);
    expect(r.r.version).toBe(2);
    await expect(one(alice, "select travelogue_save($1, 1, '{\"subtitle\": \"x\"}'::jsonb)", [tv])).rejects.toThrow(/version_conflict/);
    await expect(one(alice, "select travelogue_save($1, 2, '{\"title\": \" \"}'::jsonb)", [tv])).rejects.toThrow(/title_required/);
    // Başkasının fotoğrafı kapak yapılamaz
    const bobMedia = (await db.query<{ id: string }>(
      "insert into public.media_assets (user_id, storage_path, mime_type, size_bytes) values ($1, $2, 'image/webp', 1) returning id",
      [bob, `${bob}/${randomUUID()}.webp`])).rows[0].id;
    await expect(one(alice, "select travelogue_save($1, 2, $2::jsonb)", [tv, JSON.stringify({ cover_media_id: bobMedia })])).rejects.toThrow();

    const sec = await one<{ id: string }>(alice, "select id from travelogue_sections where travelogue_id = $1 and kind = 'introduction'", [tv]);
    const s = await one<{ r: { version: number } }>(alice, "select travelogue_section_save($1, 1, $2::jsonb) r",
      [sec.id, JSON.stringify({ content: { type: "doc", content: [] }, is_visible: false })]);
    expect(s.r.version).toBe(2);
    await expect(one(alice, "select travelogue_section_save($1, 2, '{\"kind\": \"custom\"}'::jsonb)", [sec.id])).rejects.toThrow(/invalid_patch/);
  });
});

describe("sıralama, özel bölüm ve fotoğraflar", () => {
  let tv: string;
  let entries: string[];
  beforeAll(async () => {
    tv = (await one<{ id: string }>(alice, "select travelogue_create($1, null, false) id", [
      (await db.query<{ id: string }>("insert into public.trips (user_id, title, status) values ($1, 'Ege', 'completed') returning id", [alice])).rows[0].id,
    ])).id;
    entries = [];
    for (const title of ["A", "B", "C"]) {
      entries.push((await one<{ id: string }>(alice, "select travelogue_entry_create($1, $2::jsonb) id", [tv, JSON.stringify({ title })])).id);
    }
  });

  it("yazılar elle sıralanınca seyahatname 'manual' olur; eksik veya yabancı kimlik reddedilir", async () => {
    await q(alice, "select travelogue_reorder($1, 'entries', $2::uuid[])", [tv, [entries[2], entries[0], entries[1]]]);
    const rows = await q<{ title: string }>(alice, "select title from travelogue_entries where travelogue_id = $1 order by sort_order", [tv]);
    expect(rows.map((r) => r.title)).toEqual(["C", "A", "B"]);
    expect((await one(alice, "select ordering from travelogues where id = $1", [tv])).ordering).toBe("manual");
    await expect(q(alice, "select travelogue_reorder($1, 'entries', $2::uuid[])", [tv, [entries[0], entries[1]]])).rejects.toThrow(/invalid_order/);
    await expect(q(alice, "select travelogue_reorder($1, 'entries', $2::uuid[])", [tv, [entries[0], entries[0], entries[1]]])).rejects.toThrow(/invalid_order/);
    await expect(q(bob, "select travelogue_reorder($1, 'entries', $2::uuid[])", [tv, entries])).rejects.toThrow(/travelogue_not_found/);
  });

  it("özel bölüm sona eklenir ve bölümler yeniden sıralanabilir", async () => {
    const { id } = await one<{ id: string }>(alice, "select travelogue_section_add($1, 'Bolu Dağları') id", [tv]);
    const all = await q<{ id: string; kind: string; sort_order: number }>(alice,
      "select id, kind, sort_order from travelogue_sections where travelogue_id = $1 order by sort_order", [tv]);
    expect(all.at(-1)).toMatchObject({ id, kind: "custom", sort_order: 9 });
    const ids = all.map((s) => s.id);
    await q(alice, "select travelogue_reorder($1, 'sections', $2::uuid[])", [tv, [ids.at(-1), ...ids.slice(0, -1)]]);
    expect((await one(alice, "select sort_order from travelogue_sections where id = $1", [id])).sort_order).toBe(0);
  });

  it("yazı fotoğrafları sıralı ve açıklamalı bağlanır; bağsız fotoğraf yolculuğa geçer; başkasının fotoğrafı reddedilir", async () => {
    await q(alice, "select travelogue_entry_set_media($1, $2::jsonb)", [entries[0],
      JSON.stringify([{ id: media[2], caption: "Kıyı" }, { id: media[1] }])]);
    let rows = await q(alice, "select media_id, caption, sort_order from travelogue_entry_media where entry_id = $1 order by sort_order", [entries[0]]);
    expect(rows).toEqual([{ media_id: media[2], caption: "Kıyı", sort_order: 0 }, { media_id: media[1], caption: null, sort_order: 1 }]);
    expect((await one(alice, "select trip_id is not null as linked from media_assets where id = $1", [media[2]])).linked).toBe(true);

    await q(alice, "select travelogue_entry_set_media($1, $2::jsonb)", [entries[0], JSON.stringify([{ id: media[1], caption: "Yeni" }])]);
    rows = await q(alice, "select media_id, caption from travelogue_entry_media where entry_id = $1", [entries[0]]);
    expect(rows).toEqual([{ media_id: media[1], caption: "Yeni" }]);

    const bobMedia = (await db.query<{ id: string }>(
      "insert into public.media_assets (user_id, storage_path, mime_type, size_bytes) values ($1, $2, 'image/webp', 1) returning id",
      [bob, `${bob}/${randomUUID()}.webp`])).rows[0].id;
    await expect(q(alice, "select travelogue_entry_set_media($1, $2::jsonb)", [entries[0], JSON.stringify([{ id: bobMedia }])])).rejects.toThrow(/media_not_found/);
  });

  it("liste yalnızca sahibine görünür ve sayıları içerir", async () => {
    const list = await q<{ id: string; entry_count: number; photo_count: number }>(alice, "select * from travelogue_list()");
    expect(list.find((l) => l.id === tv)).toMatchObject({ entry_count: 3, photo_count: 1 });
    expect(await q(bob, "select * from travelogue_list()")).toEqual([]);
  });

  it("seyahatname silinince yazılar silinir, fotoğraflar kalır", async () => {
    await q(alice, "delete from travelogues where id = $1", [tv]);
    expect((await one<{ c: number }>(alice, "select count(*)::int c from travelogue_entries where travelogue_id = $1", [tv])).c).toBe(0);
    expect((await one<{ c: number }>(alice, "select count(*)::int c from media_assets where id = $1", [media[1]])).c).toBe(1);
  });
});
