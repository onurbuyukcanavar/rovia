import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createTestDb, createUser, type TestDb } from "./harness";

let db: TestDb;
let user: string;

// İstanbul → Bolu → Ankara güzergâhını kabaca izleyen çizgi (lng, lat)
const ROUTE = {
  type: "LineString",
  coordinates: [[28.97, 41.01], [29.9, 40.77], [31.6, 40.73], [32.85, 39.93]],
};

async function seed() {
  await db.exec(`
    insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, admin, geog, tags, importance) values
      ('n1', 'poi', 'fuel', 'fuel', 'Bolu Dağı Petrol', 'bolu dagi petrol', 'Bolu Merkez, Bolu', 'SRID=4326;POINT(31.60 40.74)', '{"opening_hours":"24/7"}', 0.1),
      ('n2', 'poi', 'fuel', 'fuel', 'Uzak İstasyon', 'uzak istasyon', 'Kastamonu', 'SRID=4326;POINT(33.78 41.38)', '{}', 0.1),
      ('n3', 'poi', 'fuel', 'fuel', 'İzmit Akaryakıt', 'izmit akaryakit', 'İzmit, Kocaeli', 'SRID=4326;POINT(29.91 40.775)', '{}', 0.1),
      ('n4', 'poi', 'restaurant', 'restaurant', 'Mengen Lokantası', 'mengen lokantasi', 'Bolu', 'SRID=4326;POINT(31.61 40.735)', '{}', 0.1),
      ('n5', 'settlement', 'city', 'city', 'Ankara', 'ankara', 'Ankara', 'SRID=4326;POINT(32.85 39.93)', '{}', 1.0),
      ('n6', 'settlement', 'town', 'town', 'Göreme', 'goreme', 'Nevşehir Merkez, Nevşehir', 'SRID=4326;POINT(34.83 38.64)', '{}', 0.5),
      ('n7', 'poi', 'historic', 'castle', 'Ankara Kalesi', 'ankara kalesi', 'Altındağ, Ankara', 'SRID=4326;POINT(32.864 39.941)', '{}', 0.3);
    insert into public.geo_admin_areas (osm_ref, name, admin_level, geom) values
      ('r1', 'Nevşehir', 4, 'SRID=4326;MULTIPOLYGON(((34.0 38.2, 35.5 38.2, 35.5 39.2, 34.0 39.2, 34.0 38.2)))'),
      ('r2', 'Nevşehir Merkez', 6, 'SRID=4326;MULTIPOLYGON(((34.5 38.4, 35.0 38.4, 35.0 38.8, 34.5 38.8, 34.5 38.4)))');
  `);
}

beforeAll(async () => {
  db = await createTestDb();
  user = await createUser(db);
  await seed();
}, 60_000);

const asAuthed = <T>(fn: (tx: TestDb) => Promise<T>) => asUser(db, user, fn);

describe("rota boyunca arama (PostGIS)", () => {
  it("yarıçap içindeki benzinlikleri yolculuk sırasıyla döndürür; uzaktakini eler", async () => {
    const r = await asAuthed((tx) =>
      tx.query<{ osm_ref: string; distance_m: number; along_m: number }>(
        "select * from public.search_features_along_route($1::jsonb, array['fuel'], 5000, 50)", [JSON.stringify(ROUTE)],
      ),
    );
    expect(r.rows.map((x) => x.osm_ref)).toEqual(["n3", "n1"]); // önce İzmit, sonra Bolu
    expect(r.rows[0].along_m).toBeLessThan(r.rows[1].along_m);
    expect(r.rows.every((x) => x.distance_m <= 5000)).toBe(true);
  });

  it("kategori filtresi uygulanır ve birden fazla kategori birlikte aranabilir", async () => {
    const one = await asAuthed((tx) => tx.query("select * from public.search_features_along_route($1::jsonb, array['restaurant'], 5000)", [JSON.stringify(ROUTE)]));
    expect(one.rows).toHaveLength(1);
    const both = await asAuthed((tx) => tx.query("select * from public.search_features_along_route($1::jsonb, array['restaurant','fuel'], 5000)", [JSON.stringify(ROUTE)]));
    expect(both.rows).toHaveLength(3);
  });

  it("geçersiz girdiyi reddeder", async () => {
    await expect(asAuthed((tx) => tx.query("select * from public.search_features_along_route('{\"type\":\"Point\",\"coordinates\":[1,2]}', array['fuel'], 5000)")))
      .rejects.toThrow(/invalid_route/);
    await expect(asAuthed((tx) => tx.query("select * from public.search_features_along_route($1::jsonb, array['fuel'], 999999)", [JSON.stringify(ROUTE)])))
      .rejects.toThrow(/invalid_arguments/);
  });
});

describe("yakın çevre, isimle arama ve ters geocoding", () => {
  it("nokta çevresinde yakından uzağa sıralar", async () => {
    const r = await asAuthed((tx) => tx.query<{ osm_ref: string }>("select * from public.search_features_nearby(39.93, 32.85, array['historic'], 3000)"));
    expect(r.rows.map((x) => x.osm_ref)).toEqual(["n7"]);
  });

  it("aksansız ve eksik yazımla arar; önemli yerleşim üstte", async () => {
    const r = await asAuthed((tx) => tx.query<{ name: string }>("select * from public.search_places('ankara', null, null, 5)"));
    expect(r.rows[0].name).toBe("Ankara");
    expect(r.rows.map((x) => x.name)).toContain("Ankara Kalesi");
    const g = await asAuthed((tx) => tx.query<{ name: string }>("select * from public.search_places('gore', null, null, 5)"));
    expect(g.rows[0]?.name).toBe("Göreme");
  });

  it("tam ad eşleşmesi daha önemli ilgi noktalarının önüne geçer; geniş sorguda şehir aday dışında kalmaz", async () => {
    // Göreme yerleşiminden daha "önemli" bir müze ve 'ankara' ile başlayan 450 gürültü kaydı (uzak, alışveriş)
    await db.exec(`
      insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, admin, geog, importance) values
        ('n8', 'poi', 'museum', 'museum', 'Göreme Açık Hava Müzesi', 'goreme acik hava muzesi', 'Nevşehir', 'SRID=4326;POINT(34.845 38.64)', 0.9);
      insert into public.geo_features (osm_ref, kind, category, subtype, name, name_search, geog, importance)
        select 'n' || (1000 + i), 'poi', 'shopping', 'supermarket', 'Ankara Market ' || i, 'ankara market ' || i, 'SRID=4326;POINT(40 40)', 0.6
        from generate_series(1, 450) i;`);
    try {
      const g = await asAuthed((tx) => tx.query<{ name: string }>("select * from public.search_places('goreme', null, null, 5)"));
      expect(g.rows.map((x) => x.name).slice(0, 2)).toEqual(["Göreme", "Göreme Açık Hava Müzesi"]);
      const a = await asAuthed((tx) => tx.query<{ name: string }>("select * from public.search_places('ankara', null, null, 5)"));
      expect(a.rows[0].name).toBe("Ankara");
      const short = await asAuthed((tx) => tx.query<{ name: string }>("select * from public.search_places('an', null, null, 5)"));
      expect(short.rows[0].name).toBe("Ankara");
    } finally {
      await db.exec("delete from public.geo_features where osm_ref = 'n8' or (osm_ref like 'n1___' and category = 'shopping')");
    }
  });

  it("ters geocoding: yerleşim, ilçe, il", async () => {
    const r = await asAuthed((tx) => tx.query<{ label: string; province: string }>("select * from public.reverse_geocode(38.645, 34.83)"));
    expect(r.rows[0]).toMatchObject({ label: "Göreme, Nevşehir Merkez, Nevşehir", province: "Nevşehir" });
  });

  it("anonim erişim yok; oturum açmış kullanıcı veri yazamaz", async () => {
    await expect(asUser(db, null, (tx) => tx.query("select * from public.search_places('ankara')"))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, (tx) => tx.query("select * from public.geo_features"))).rejects.toThrow(/permission denied/);
    await expect(asAuthed((tx) => tx.query("delete from public.geo_features"))).rejects.toThrow(/permission denied/);
    await expect(
      asAuthed((tx) => tx.query("insert into public.geo_features (osm_ref, kind, category, name, name_search, geog) values ('n99','poi','fuel','x','x','SRID=4326;POINT(0 0)')")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("OSM içe aktarma dönüşümü (scripts/osm/apply.sql)", () => {
  it("staging verisini yayınlar: alanı temsil noktasına çevirir, il/ilçe etiketi ekler, eskiyi değiştirir", async () => {
    const { readFileSync } = await import("node:fs");
    const apply = readFileSync("scripts/osm/apply.sql", "utf8");
    const hex = async (wkt: string) =>
      (await db.query<{ h: string }>("select encode(extensions.st_asbinary(extensions.st_geomfromtext($1)), 'hex') h", [wkt])).rows[0].h;

    // Not: PGlite tek bağlantılıdır; WKB'ler işlemden önce hazırlanır (işlem içinde db.query kilitlenir)
    const wkb = {
      nevsehir: await hex("MULTIPOLYGON(((34 38,35.5 38,35.5 39.2,34 39.2,34 38)))"),
      urgup: await hex("POLYGON((34.8 38.5,35.1 38.5,35.1 38.75,34.8 38.75,34.8 38.5))"),
      goreme: await hex("POINT(34.83 38.643)"),
      castle: await hex("POLYGON((34.80 38.63,34.81 38.63,34.81 38.64,34.80 38.64,34.80 38.63))"),
    };
    await db.transaction(async (tx) => {
      await tx.exec(`
        create temp table stg_meta (source text, data_timestamp timestamptz) on commit drop;
        insert into stg_meta values ('test', '2026-11-15T21:00:00Z');
        create temp table stg_features (osm_ref text, kind text, category text, subtype text, name text, name_search text, tags text, importance text, wkb text) on commit drop;
        create temp table stg_admin (osm_ref text, name text, admin_level text, wkb text) on commit drop;`);
      await tx.query("insert into stg_admin values ('r300','Nevşehir','4',$1), ('r301','Ürgüp','6',$2)", [wkb.nevsehir, wkb.urgup]);
      await tx.query(
        `insert into stg_features values
          ('n4','settlement','town','town','Göreme','goreme','{}','0.6',$1),
          ('w100','poi','historic','castle','Uçhisar Kalesi','uchisar kalesi','{"wikidata":"Q1"}','0.3',$2),
          ('w100','poi','historic','castle','Kopya','kopya','{}','0.3',$2),
          ('n9','poi','fuel','fuel','','', '{}','0.1',$1)`,
        [wkb.goreme, wkb.castle],
      );
      await tx.exec(apply);
    });

    const rows = (await db.query<{ osm_ref: string; admin: string; tags: Record<string, string> }>(
      "select osm_ref, admin, tags from public.geo_features order by osm_ref")).rows;
    expect(rows.map((r) => r.osm_ref)).toEqual(["n4", "w100"]); // önceki test verisi silindi, isimsiz ve kopya elendi
    expect(rows[0].admin).toBe("Ürgüp, Nevşehir");
    expect(rows[1].tags).toEqual({ wikidata: "Q1" });
    const run = (await db.query<{ feature_count: number; admin_count: number }>("select * from public.geo_import_runs order by id desc limit 1")).rows[0];
    expect([run.feature_count, run.admin_count]).toEqual([2, 2]);

    // Yayınlanan veri arama fonksiyonlarında kullanılabilir
    const near = await asAuthed((tx) => tx.query<{ osm_ref: string }>("select * from public.search_features_nearby(38.635, 34.805, array['historic'], 2000)"));
    expect(near.rows.map((r) => r.osm_ref)).toEqual(["w100"]);
  });
});
