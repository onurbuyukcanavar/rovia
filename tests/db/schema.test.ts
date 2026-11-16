import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice Yolcu", avatar_url: "https://example.test/a.png" });
  bob = await createUser(db, { name: "Bob Gezgin" });
}, 60_000);

async function createTrip(userId: string, title = "İstanbul – Kapadokya Keşif Yolculuğu") {
  return asUser(db, userId, async (tx) => {
    const r = await tx.query<{ id: string }>(
      "insert into trips (user_id, title) values ($1, $2) returning id",
      [userId, title],
    );
    return r.rows[0].id;
  });
}

describe("migration", () => {
  it("tüm tabloları oluşturur ve hepsinde RLS açıktır", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    const names = r.rows.map((x) => x.relname);
    expect(names).toEqual(
      expect.arrayContaining([
        "profiles", "user_settings", "vehicles", "trips", "trip_stops", "trip_recordings",
        "recording_segments", "gps_points", "saved_places", "import_batches", "media_assets",
        "journal_notes", "journal_note_media", "travelogues", "travelogue_sections",
        "travelogue_entries", "travelogue_entry_media", "travelogue_entry_revisions", "shares",
      ]),
    );
    for (const row of r.rows) expect(row.relrowsecurity, row.relname).toBe(true);
  });

  it("kayıtta profil ve ayar satırını Google meta verisinden doldurur", async () => {
    const r = await asUser(db, alice, (tx) =>
      tx.query<{ full_name: string; avatar_url: string; default_visibility: string }>(
        "select p.full_name, p.avatar_url, s.default_visibility from profiles p join user_settings s on s.user_id = p.id",
      ),
    );
    expect(r.rows).toEqual([
      { full_name: "Alice Yolcu", avatar_url: "https://example.test/a.png", default_visibility: "private" },
    ]);
    const b = await asUser(db, bob, (tx) => tx.query<{ full_name: string }>("select full_name from profiles"));
    expect(b.rows[0].full_name).toBe("Bob Gezgin");
  });
});

describe("RLS izolasyonu", () => {
  it("kullanıcı başkasının yolculuğunu göremez, değiştiremez, silemez", async () => {
    const tripId = await createTrip(alice);

    const seen = await asUser(db, bob, (tx) => tx.query("select * from trips where id = $1", [tripId]));
    expect(seen.rows).toHaveLength(0);

    const upd = await asUser(db, bob, (tx) => tx.query("update trips set title = 'hack' where id = $1", [tripId]));
    expect(upd.affectedRows).toBe(0);

    const del = await asUser(db, bob, (tx) => tx.query("delete from trips where id = $1", [tripId]));
    expect(del.affectedRows).toBe(0);

    const own = await asUser(db, alice, (tx) => tx.query<{ title: string }>("select title from trips where id = $1", [tripId]));
    expect(own.rows[0].title).toBe("İstanbul – Kapadokya Keşif Yolculuğu");
  });

  it("kullanıcı başkası adına kayıt oluşturamaz", async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query("insert into trips (user_id, title) values ($1, 'sahte')", [alice])),
    ).rejects.toThrow(/row-level security/);
  });

  it("kullanıcı sahipliği başka kullanıcıya devredemez", async () => {
    const tripId = await createTrip(bob, "Bob'un yolu");
    await expect(
      asUser(db, bob, (tx) => tx.query("update trips set user_id = $1 where id = $2", [alice, tripId])),
    ).rejects.toThrow(/row-level security/);
  });

  it("başkasının yolculuğuna durak, kayıt veya seyahatname bağlanamaz", async () => {
    const aliceTrip = await createTrip(alice);
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(
          "insert into trip_stops (trip_id, user_id, stop_order, name, latitude, longitude) values ($1, $2, 0, 'Bolu', 40.7, 31.6)",
          [aliceTrip, bob],
        ),
      ),
    ).rejects.toThrow(/ownership_violation/);
    await expect(
      asUser(db, bob, (tx) => tx.query("insert into trip_recordings (trip_id, user_id) values ($1, $2)", [aliceTrip, bob])),
    ).rejects.toThrow(/ownership_violation/);
    await expect(
      asUser(db, bob, (tx) => tx.query("insert into travelogues (trip_id, user_id, title) values ($1, $2, 'x')", [aliceTrip, bob])),
    ).rejects.toThrow(/ownership_violation/);
  });

  it("anonim kullanıcı hiçbir tabloya erişemez", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from trips"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query("select * from profiles"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query("select public.dashboard_stats()"))).rejects.toThrow(/permission denied/);
  });

  it("storage: kullanıcı yalnızca kendi klasörüne yükleyebilir", async () => {
    await asUser(db, alice, (tx) =>
      tx.query("insert into storage.objects (bucket_id, name) values ('media', $1)", [`${alice}/foto.jpg`]),
    );
    await expect(
      asUser(db, bob, (tx) =>
        tx.query("insert into storage.objects (bucket_id, name) values ('media', $1)", [`${alice}/sızma.jpg`]),
      ),
    ).rejects.toThrow(/row-level security/);
    const bobSees = await asUser(db, bob, (tx) => tx.query("select * from storage.objects"));
    expect(bobSees.rows).toHaveLength(0);
  });

  it("media_assets yolu sahibin klasöründe olmak zorunda", async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          "insert into media_assets (user_id, storage_path, mime_type, size_bytes) values ($1, $2, 'image/jpeg', 1000)",
          [alice, `${bob}/x.jpg`],
        ),
      ),
    ).rejects.toThrow(/media_assets_path_owner/);
  });
});

describe("iş kuralları", () => {
  it("bir yolculukta yalnızca bir başlangıç ve bir varış olabilir; durak sırası yer değiştirebilir", async () => {
    const tripId = await createTrip(alice);
    await asUser(db, alice, async (tx) => {
      await tx.query(
        `insert into trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values
          ($1, $2, 'origin', 0, 'İstanbul', 41.01, 28.97),
          ($1, $2, 'waypoint', 1, 'Bolu', 40.73, 31.6),
          ($1, $2, 'waypoint', 2, 'Ankara', 39.93, 32.85),
          ($1, $2, 'destination', 3, 'Göreme', 38.64, 34.83)`,
        [tripId, alice],
      );
      // Ertelenebilir benzersiz kısıt sayesinde iki durağın yeri tek işlemde değiştirilebilir
      await tx.query(
        "update trip_stops set stop_order = case stop_order when 1 then 2 when 2 then 1 end where trip_id = $1 and stop_order in (1, 2)",
        [tripId],
      );
    });
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          "insert into trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values ($1, $2, 'origin', 9, 'İkinci başlangıç', 41, 29)",
          [tripId, alice],
        ),
      ),
    ).rejects.toThrow(/trip_stops_one_origin/);
  });

  it("bir kullanıcının aynı anda yalnızca bir aktif GPS kaydı olabilir", async () => {
    const t1 = await createTrip(bob, "Kayıt 1");
    const t2 = await createTrip(bob, "Kayıt 2");
    await asUser(db, bob, (tx) => tx.query("insert into trip_recordings (trip_id, user_id) values ($1, $2)", [t1, bob]));
    await expect(
      asUser(db, bob, (tx) => tx.query("insert into trip_recordings (trip_id, user_id) values ($1, $2)", [t2, bob])),
    ).rejects.toThrow(/trip_recordings_one_active_per_user/);
  });

  it("GPS toplu gönderimi idempotenttir (aynı zaman damgası tekrar yazılmaz)", async () => {
    const trip = await createTrip(alice, "GPS testi");
    await asUser(db, alice, async (tx) => {
      const rec = await tx.query<{ id: string }>(
        "insert into trip_recordings (trip_id, user_id) values ($1, $2) returning id",
        [trip, alice],
      );
      const recId = rec.rows[0].id;
      const insert = () =>
        tx.query(
          `insert into gps_points (recording_id, user_id, recorded_at, latitude, longitude, accuracy_m)
           values ($1, $2, '2026-11-16T08:30:00Z', 41.0, 29.0, 8), ($1, $2, '2026-11-16T08:30:05Z', 41.001, 29.001, 7)
           on conflict (recording_id, recorded_at) do nothing`,
          [recId, alice],
        );
      await insert();
      await insert();
      const c = await tx.query<{ n: number }>("select count(*)::int as n from gps_points where recording_id = $1", [recId]);
      expect(c.rows[0].n).toBe(2);
    });
  });

  it("aynı Google yeri favorilere iki kez eklenemez; kaynak bilgisi korunur", async () => {
    await asUser(db, alice, (tx) =>
      tx.query(
        "insert into saved_places (user_id, name, google_place_id, source) values ($1, 'Tuz Gölü', 'ChIJ-tuz', 'google_takeout')",
        [alice],
      ),
    );
    await expect(
      asUser(db, alice, (tx) =>
        tx.query("insert into saved_places (user_id, name, google_place_id) values ($1, 'Tuz Gölü', 'ChIJ-tuz')", [alice]),
      ),
    ).rejects.toThrow(/saved_places_user_google_place_key/);
    // Başka kullanıcı aynı yeri kaydedebilir
    await asUser(db, bob, (tx) =>
      tx.query("insert into saved_places (user_id, name, google_place_id) values ($1, 'Tuz Gölü', 'ChIJ-tuz')", [bob]),
    );
  });

  it("paylaşım yalnızca tek bir hedefe bağlanır ve tahmin edilemez token üretir", async () => {
    const trip = await createTrip(alice, "Paylaşılacak");
    const r = await asUser(db, alice, (tx) =>
      tx.query<{ token: string }>("insert into shares (user_id, trip_id) values ($1, $2) returning token", [alice, trip]),
    );
    expect(r.rows[0].token).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      asUser(db, alice, (tx) => tx.query("insert into shares (user_id) values ($1)", [alice])),
    ).rejects.toThrow(/shares_exactly_one_target/);
  });

  it("panel istatistikleri yalnızca çağıranın verisini sayar", async () => {
    const statsFor = (id: string) =>
      asUser(db, id, async (tx) => (await tx.query<{ s: Record<string, number> }>("select public.dashboard_stats() as s")).rows[0].s);

    const before = await statsFor(bob);
    const trip = await createTrip(bob, "Tamamlanan");
    await asUser(db, bob, async (tx) => {
      await tx.query("update trips set status = 'completed' where id = $1", [trip]);
      await tx.query(
        "insert into trip_stops (trip_id, user_id, kind, stop_order, name, latitude, longitude) values ($1, $2, 'destination', 0, 'Göreme', 38.64, 34.83)",
        [trip, bob],
      );
    });
    const after = await statsFor(bob);
    expect(Number(after.completed_trips)).toBe(Number(before.completed_trips) + 1);
    expect(Number(after.visited_places)).toBe(Number(before.visited_places) + 1);

    const aliceStats = await statsFor(alice);
    expect(Number(aliceStats.completed_trips)).toBe(0);
  });

  it("kullanıcı silindiğinde tüm verisi silinir (KVKK silme hakkı)", async () => {
    const carol = await createUser(db, { full_name: "Carol" });
    const trip = await createTrip(carol, "Silinecek");
    await asUser(db, carol, (tx) =>
      tx.query("insert into journal_notes (user_id, trip_id, title) values ($1, $2, 'not')", [carol, trip]),
    );
    await db.query("delete from auth.users where id = $1", [carol]);
    const left = await db.query<{ n: number }>(
      `select (select count(*) from trips where user_id = $1)
            + (select count(*) from journal_notes where user_id = $1)
            + (select count(*) from profiles where id = $1)
            + (select count(*) from user_settings where user_id = $1) as n`,
      [carol],
    );
    expect(Number(left.rows[0].n)).toBe(0);
  });
});
