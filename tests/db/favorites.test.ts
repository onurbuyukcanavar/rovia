import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let alice: string;
let bob: string;

type SaveResult = {
  batch_id: string | null; imported: number; duplicates: number; invalid: number;
  results: { i: number; status: "imported" | "duplicate" | "invalid"; id?: string }[];
};

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { full_name: "Alice" });
  bob = await createUser(db, { full_name: "Bob" });
  await db.exec(`
    insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, admin, geog, importance) values
      ('n501', 'poi', 'cafe', 'cafe', 'Pierre Loti Kahvesi', 'pierre loti kahvesi', 'Eyüpsultan, İstanbul', 'SRID=4326;POINT(28.9336 41.0539)', 0.3),
      ('n502', 'poi', 'museum', 'museum', 'Topkapı Sarayı Müzesi', 'topkapi sarayi muzesi', 'Fatih, İstanbul', 'SRID=4326;POINT(28.9834 41.0115)', 0.9),
      ('n503', 'poi', 'fuel', 'fuel', 'Göreme Petrol', 'goreme petrol', 'Nevşehir', 'SRID=4326;POINT(34.83 38.64)', 0.1),
      ('n504', 'settlement', 'town', 'town', 'Göreme', 'goreme', 'Nevşehir Merkez, Nevşehir', 'SRID=4326;POINT(34.8289 38.6431)', 0.5);`);
}, 60_000);

function save(user: string, source: string, items: unknown[], file: string | null = null) {
  return asUser(db, user, async (tx) =>
    (await tx.query<{ r: SaveResult }>("select save_places($1, $2, $3::jsonb) r", [source, file, JSON.stringify(items)])).rows[0].r);
}

const rows = (user: string) =>
  asUser(db, user, async (tx) =>
    (await tx.query<Record<string, unknown>>("select name, category, list_type, source, source_ref, source_list_name, osm_ref, notes, import_batch_id from saved_places order by created_at, name")).rows);

describe("save_places", () => {
  it("elle ekleme: kategori ve liste türü kullanıcıdan; OSM kimliği yakındaki yerden", async () => {
    const r = await save(alice, "manual", [
      { name: "Pierre Loti Kahvesi", lat: 41.05392, lng: 28.93362, category: "cafe", notes: "Gün batımında", list_type: "want_to_go" },
    ]);
    expect(r).toMatchObject({ batch_id: null, imported: 1, duplicates: 0, invalid: 0 });
    expect((await rows(alice))[0]).toMatchObject({
      name: "Pierre Loti Kahvesi", category: "cafe", list_type: "want_to_go", source: "manual", osm_ref: "n501", notes: "Gün batımında",
    });
  });

  it("kategori verilmezse OSM'den çıkarılır (müze → gezilecek yer); eşleşme yoksa 'diğer'", async () => {
    const r = await save(alice, "google_takeout", [
      { name: "Topkapi Sarayi Muzesi", lat: 41.0116, lng: 28.9833, source_ref: "https://maps.google.com/?cid=1", list_name: "İstanbul" },
      { name: "Bilinmeyen Kahvaltıcı", lat: 40.5, lng: 30.2, source_ref: "https://maps.google.com/?cid=2" },
    ], "Saved Places.json");
    expect(r.imported).toBe(2);
    expect(r.batch_id).not.toBeNull();
    const all = await rows(alice);
    expect(all.find((x) => x.name === "Topkapi Sarayi Muzesi")).toMatchObject({ category: "attraction", osm_ref: "n502", source_list_name: "İstanbul" });
    expect(all.find((x) => x.name === "Bilinmeyen Kahvaltıcı")).toMatchObject({ category: "other", osm_ref: null });
    const [batch] = await asUser(db, alice, async (tx) =>
      (await tx.query("select status, total_count, imported_count, skipped_count from import_batches where id = $1", [r.batch_id])).rows);
    expect(batch).toEqual({ status: "completed", total_count: 2, imported_count: 2, skipped_count: 0 });
  });

  it("mükerrerler: aynı OSM yeri, aynı kaynak bağlantısı, aynı ad 75 m içinde; aynı içe aktarmadaki tekrar", async () => {
    const r = await save(alice, "google_takeout", [
      { name: "Topkapı Sarayı", lat: 41.0115, lng: 28.9834, source_ref: "https://maps.google.com/?cid=99" }, // aynı OSM yeri (n502)
      { name: "Başka ad", lat: 40.5, lng: 30.2, source_ref: "https://maps.google.com/?cid=2" }, // aynı bağlantı
      { name: "BİLİNMEYEN KAHVALTICI", lat: 40.5003, lng: 30.2002 }, // aynı ad, ~40 m
      { name: "Yeni Yer", lat: 39.0, lng: 35.0 },
      { name: "Yeni Yer", lat: 39.0001, lng: 35.0001 }, // aynı içe aktarmada tekrar
    ], "Want to go.csv");
    expect(r).toMatchObject({ imported: 1, duplicates: 4, invalid: 0 });
    expect(r.results.map((x) => x.status)).toEqual(["duplicate", "duplicate", "duplicate", "imported", "duplicate"]);
    expect(r.results[0].id).toBeTruthy();
  });

  it("aynı ad ama 75 m'den uzak: ayrı yer sayılır (zincir mağazalar)", async () => {
    const r = await save(alice, "manual", [{ name: "Yeni Yer", lat: 39.01, lng: 35.0 }]);
    expect(r.imported).toBe(1);
  });

  it("geçersiz kayıtlar atlanır, diğerleri kaydedilir", async () => {
    const r = await save(alice, "kml", [
      { name: "", lat: 40, lng: 30 },
      { name: "Koordinatsız" },
      { name: "Sıfır", lat: 0, lng: 0 },
      { name: "Kapsam dışı", lat: 95, lng: 30 },
      { name: "Metin koordinat", lat: "abc", lng: 30 },
      { name: "Geçerli", lat: 40.1, lng: 30.1, osm_ref: "kötü-ref", category: "uydurma" },
    ], "harita.kml");
    expect(r).toMatchObject({ imported: 1, invalid: 5 });
    const g = (await rows(alice)).find((x) => x.name === "Geçerli");
    expect(g).toMatchObject({ osm_ref: null, category: "other", source: "kml" });
  });

  it("kullanıcılar birbirinin yerini görmez; başkasının kaydı mükerrer sayılmaz", async () => {
    const r = await save(bob, "manual", [{ name: "Pierre Loti Kahvesi", lat: 41.05392, lng: 28.93362 }]);
    expect(r.imported).toBe(1);
    expect((await rows(bob)).map((x) => x.name)).toEqual(["Pierre Loti Kahvesi"]);
    expect((await rows(bob))[0].category).toBe("cafe"); // OSM'den çıkarıldı
  });

  it("girdi sınırları ve yetki", async () => {
    await expect(save(alice, "hack", [{ name: "x", lat: 1, lng: 1 }])).rejects.toThrow(/invalid_source/);
    await expect(save(alice, "manual", [])).rejects.toThrow(/invalid_items/);
    await expect(save(alice, "manual", Array.from({ length: 1001 }, () => ({ name: "x", lat: 1, lng: 1 })))).rejects.toThrow(/invalid_items/);
    await expect(
      asUser(db, null, (tx) => tx.query("select save_places('manual', null, '[{\"name\":\"x\",\"lat\":1,\"lng\":1}]'::jsonb)")),
    ).rejects.toThrow(/permission denied/);
  });

  it("ad anahtarı Türkçe karakterleri sadeleştirir", async () => {
    const r = await db.query<{ k: string }>("select public.place_name_key('  İSTANBUL Çay-Bahçesi (Üsküdar) ') k");
    expect(r.rows[0].k).toBe("istanbul cay bahcesi uskudar");
  });
});

describe("match_place_names", () => {
  it("koordinatsız adlar için güçlü eşleşmeleri sırasıyla döndürür; zayıfları döndürmez", async () => {
    const r = await asUser(db, alice, async (tx) =>
      (await tx.query<{ i: number; osm_ref: string; category: string }>(
        "select * from match_place_names($1) order by i", [["goreme", "pierre loti kahvesi", "zzz yok boyle bir yer qq"]])).rows);
    expect(r.map((x) => [x.i, x.osm_ref])).toEqual([[1, "n504"], [2, "n501"]]);
    await expect(asUser(db, alice, (tx) => tx.query("select * from match_place_names($1)", [Array.from({ length: 201 }, () => "a")])))
      .rejects.toThrow(/invalid_arguments/);
  });
});
