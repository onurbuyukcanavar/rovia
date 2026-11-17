import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { EXPORT_TABLES, MEDIA_URL_TTL, PAGE_SIZE, type ExportTable, type Row, type TableSource } from "./export";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Tablo adları çalışma zamanında seçildiği için gevşek tipli sorgu kurucu (yalnızca okuma). */
type LooseQuery = {
  eq(col: string, v: unknown): LooseQuery;
  gt(col: string, v: unknown): LooseQuery;
  order(col: string, o: { ascending: boolean }): LooseQuery;
  limit(n: number): LooseQuery;
  range(from: number, to: number): LooseQuery;
  then: PromiseLike<{ data: Row[] | null; error: { message: string; code?: string } | null }>["then"];
};
type LooseDb = { from(table: string): { select(cols: string): LooseQuery } };

async function* tablePages(db: Db, uid: string, spec: ExportTable): AsyncGenerator<Row[]> {
  const loose = db as unknown as LooseDb;
  const base = () => {
    let q = loose.from(spec.table).select("*").eq(spec.owner, uid);
    for (const col of spec.order) q = q.order(col, { ascending: true });
    return q;
  };
  let offset = 0;
  let cursor: unknown = null;
  let fetched = 0;
  // Sunucunun en fazla satır ayarı PAGE_SIZE'dan küçük olabilir: boş sayfa gelene dek devam edilir.
  for (;;) {
    let q = base();
    if (spec.keyset) {
      if (cursor !== null) q = q.gt(spec.order[0], cursor);
      q = q.limit(PAGE_SIZE);
    } else {
      q = q.range(offset, offset + PAGE_SIZE - 1);
    }
    const { data, error } = await q;
    if (error) throw new Error(`export_${spec.table}: ${error.code ?? error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) return;
    yield spec.table === "media_assets" ? await withDownloadUrls(db, rows) : rows;
    fetched += rows.length;
    offset += rows.length;
    cursor = rows[rows.length - 1][spec.order[0]];
    // Üst sınır aşıldığını anlamak için bir satır fazlası yeterli
    if (spec.limit !== undefined && fetched > spec.limit) return;
  }
}

/** Fotoğraf satırlarına 24 saat geçerli imzalı indirme bağlantıları ekler (yalnızca sahibin okuyabildiği depo). */
async function withDownloadUrls(db: Db, rows: Row[]): Promise<Row[]> {
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => typeof p === "string");
  const urls = new Map<string, string>();
  for (let i = 0; i < paths.length; i += 500) {
    const { data, error } = await db.storage.from("media").createSignedUrls(paths.slice(i, i + 500), MEDIA_URL_TTL, { download: true });
    if (error) {
      console.error("[rovia] export imzalı bağlantı:", error.message);
      continue;
    }
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  const expires = new Date(Date.now() + MEDIA_URL_TTL * 1000).toISOString();
  return rows.map((r) => {
    const url = typeof r.storage_path === "string" ? urls.get(r.storage_path) : undefined;
    return { ...r, download_url: url ?? null, download_url_expires_at: url ? expires : null };
  });
}

export function accountExportSources(db: Db, uid: string): TableSource[] {
  return EXPORT_TABLES.map((spec) => ({ spec, pages: () => tablePages(db, uid, spec) }));
}
