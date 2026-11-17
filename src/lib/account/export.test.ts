import { describe, expect, it } from "vitest";
import { collectExport, EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, EXPORT_TABLES, exportFileName, type Row, type TableSource } from "./export";

const meta = { exportedAt: new Date("2026-11-17T22:30:00Z"), account: { id: "u1", email: "a@rovia.test" } };

async function* pagesOf(...pages: Row[][]) {
  for (const p of pages) yield p;
}

describe("exportFileName", () => {
  it("Türkiye saatine göre tarih kullanır", () => {
    // 22:30 UTC = 01:30 (+03) ertesi gün
    expect(exportFileName(new Date("2026-11-17T22:30:00Z"))).toBe("rovia-verilerim-2026-11-18.json");
    expect(exportFileName(new Date("2026-01-05T09:00:00Z"))).toBe("rovia-verilerim-2026-01-05.json");
  });
});

describe("EXPORT_TABLES", () => {
  it("kullanıcıya ait tüm tabloları içerir, hız sınırı sayacını içermez", () => {
    const names = EXPORT_TABLES.map((s) => s.table);
    for (const n of ["profiles", "user_settings", "vehicles", "trips", "trip_stops", "trip_recordings", "recording_segments",
      "gps_points", "saved_places", "import_batches", "media_assets", "journal_notes", "journal_note_media", "travelogues",
      "travelogue_sections", "travelogue_entries", "travelogue_entry_media", "travelogue_entry_revisions", "shares"]) {
      expect(names).toContain(n);
    }
    expect(names).not.toContain("api_rate_limits");
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("collectExport", () => {
  it("geçerli JSON üretir: başlık, tablolar, sayımlar ve özet", async () => {
    const sources: TableSource[] = [
      { spec: { table: "trips", owner: "user_id", order: ["id"] }, pages: () => pagesOf([{ id: "t1", user_id: "u1", title: "Kapadokya \"gezi\"\n" }], [{ id: "t2", user_id: "u1" }]) },
      { spec: { table: "vehicles", owner: "user_id", order: ["id"], note: "not" }, pages: () => pagesOf() },
    ];
    const doc = JSON.parse(await collectExport(meta, sources));
    expect(doc.format).toBe(EXPORT_FORMAT);
    expect(doc.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(doc.exportedAt).toBe("2026-11-17T22:30:00.000Z");
    expect(doc.account).toEqual({ id: "u1", email: "a@rovia.test" });
    expect(doc.tables.trips.rows.map((r: Row) => r.id)).toEqual(["t1", "t2"]);
    expect(doc.tables.trips.rows[0].title).toBe("Kapadokya \"gezi\"\n");
    expect(doc.tables.trips.count).toBe(2);
    expect(doc.tables.vehicles).toEqual({ note: "not", rows: [], count: 0, truncated: false });
    expect(doc.summary).toEqual({ trips: { count: 2, truncated: false }, vehicles: { count: 0, truncated: false } });
  });

  it("üst sınırı uygular ve kısaltıldığını işaretler", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i }));
    const doc = JSON.parse(await collectExport(meta, [
      { spec: { table: "gps_points", owner: "user_id", order: ["id"], limit: 3 }, pages: () => pagesOf(rows.slice(0, 2), rows.slice(2)) },
    ]));
    expect(doc.tables.gps_points.rows).toHaveLength(3);
    expect(doc.tables.gps_points.truncated).toBe(true);
  });

  it("tablo yoksa da geçerli JSON", async () => {
    const doc = JSON.parse(await collectExport(meta, []));
    expect(doc.tables).toEqual({});
    expect(doc.summary).toEqual({});
  });
});
