/**
 * Hesap verisi dışa aktarma (KVKK m. 11): tablo listesi, dosya adı ve JSON akışı.
 * Saf modül: veri kaynağı dışarıdan verilir (birim testlerinde sahte sayfalar).
 */

export const EXPORT_FORMAT = "rovia-account-export";
export const EXPORT_SCHEMA_VERSION = 1;
/** Ham GPS noktası üst sınırı: aşılırsa dosyada `truncated: true` ve açıklama yer alır. */
export const GPS_POINT_LIMIT = 250_000;
export const PAGE_SIZE = 1000;
/** Fotoğraf indirme bağlantılarının geçerlilik süresi (saniye). */
export const MEDIA_URL_TTL = 24 * 60 * 60;

export type ExportTable = {
  /** public şemadaki tablo adı */
  table: string;
  /** Sahiplik sütunu (RLS'e ek olarak açıkça süzülür: paylaşılan başka kullanıcı verisi dosyaya girmez) */
  owner: "user_id" | "id";
  /** Kararlı sıralama sütunları (sayfalama için) */
  order: readonly string[];
  /** Büyük tablolar: anahtar tabanlı (keyset) sayfalama, `order[0]` tekil ve artan olmalı */
  keyset?: boolean;
  limit?: number;
  note?: string;
};

/** Kullanıcıya ait tüm public tablolar (api_rate_limits hariç: hizmet içi sayaç, kişisel içerik değil). */
export const EXPORT_TABLES: readonly ExportTable[] = [
  { table: "profiles", owner: "id", order: ["id"] },
  { table: "user_settings", owner: "user_id", order: ["user_id"] },
  { table: "vehicles", owner: "user_id", order: ["id"] },
  { table: "trips", owner: "user_id", order: ["id"] },
  { table: "trip_stops", owner: "user_id", order: ["id"] },
  { table: "trip_recordings", owner: "user_id", order: ["id"] },
  { table: "recording_segments", owner: "user_id", order: ["id"] },
  {
    table: "gps_points", owner: "user_id", order: ["id"], keyset: true, limit: GPS_POINT_LIMIT,
    note: "Ham GPS noktaları (saklama süresi ayarına göre). Sınır aşılırsa liste kısaltılır; tam iz için yolculuk sayfasındaki GPX dışa aktarmayı kullan.",
  },
  { table: "saved_places", owner: "user_id", order: ["id"] },
  { table: "import_batches", owner: "user_id", order: ["id"] },
  {
    table: "media_assets", owner: "user_id", order: ["id"],
    note: "Fotoğraf bilgileri (dosyanın kendisi değil). Her satırdaki download_url ile fotoğraf 24 saat içinde ayrıca indirilebilir.",
  },
  { table: "journal_notes", owner: "user_id", order: ["id"] },
  { table: "journal_note_media", owner: "user_id", order: ["note_id", "media_id"] },
  { table: "travelogues", owner: "user_id", order: ["id"] },
  { table: "travelogue_sections", owner: "user_id", order: ["id"] },
  { table: "travelogue_entries", owner: "user_id", order: ["id"] },
  { table: "travelogue_entry_media", owner: "user_id", order: ["entry_id", "media_id"] },
  { table: "travelogue_entry_revisions", owner: "user_id", order: ["id"] },
  {
    table: "shares", owner: "user_id", order: ["id"],
    note: "token: paylaşım bağlantının gizli anahtarıdır (/p/<token>). Bu dosyayı paylaşırsan bağlantıların da paylaşılmış olur.",
  },
];

export type Row = Record<string, unknown>;

export type ExportMeta = {
  exportedAt: Date;
  account: { id: string; email: string | null; created_at?: string | null; last_sign_in_at?: string | null };
};

export type TableSource = {
  spec: ExportTable;
  /** Satır sayfaları; üst sınır (spec.limit) bu modülde uygulanır */
  pages: () => AsyncIterable<Row[]>;
};

/** `rovia-verilerim-YYYY-MM-DD.json` (Türkiye saatine göre tarih). */
export function exportFileName(date: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  return `rovia-verilerim-${day}.json`;
}

export function exportHeader(meta: ExportMeta) {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: meta.exportedAt.toISOString(),
    generator: "ROVIA",
    legalBasis: "KVKK m. 11 — kişisel verilere erişim ve bir kopyasını alma",
    account: meta.account,
    notes: [
      "Bu dosya hesabına ait tüm kayıtların bir kopyasıdır; yalnızca sana aittir, kimseyle paylaşma.",
      "Zaman damgaları ISO 8601 (UTC), konumlar WGS84 enlem/boylam (derece) biçimindedir.",
      "Fotoğraf dosyaları gömülü değildir; media_assets satırlarındaki download_url bağlantıları 24 saat geçerlidir.",
      "Hız sınırı sayaçları (api_rate_limits) kişisel içerik olmadığından dahil edilmemiştir.",
    ],
  };
}

const indent = (json: string, pad: string) => json.replace(/\n/g, `\n${pad}`);

/**
 * JSON belgesini parça parça üretir (bellekte tek seferde tutulmaz). Biçim:
 * { ...header, "tables": { "<ad>": { "note"?, "rows": [...], "count", "truncated" } }, "summary": {...} }
 */
export async function* exportChunks(meta: ExportMeta, sources: readonly TableSource[]): AsyncGenerator<string> {
  const header = JSON.stringify(exportHeader(meta), null, 2);
  yield `${header.slice(0, -2)},\n  "tables": {`;
  const summary: Record<string, { count: number; truncated: boolean }> = {};

  for (let i = 0; i < sources.length; i++) {
    const { spec, pages } = sources[i];
    yield `${i ? "," : ""}\n    ${JSON.stringify(spec.table)}: {`;
    if (spec.note) yield `\n      "note": ${JSON.stringify(spec.note)},`;
    yield `\n      "rows": [`;
    let count = 0;
    let truncated = false;
    outer: for await (const page of pages()) {
      for (const row of page) {
        if (spec.limit !== undefined && count >= spec.limit) {
          truncated = true;
          break outer;
        }
        yield `${count ? "," : ""}\n        ${indent(JSON.stringify(row), "        ")}`;
        count++;
      }
    }
    yield `${count ? "\n      " : ""}],\n      "count": ${count},\n      "truncated": ${truncated}\n    }`;
    summary[spec.table] = { count, truncated };
  }

  yield `\n  },\n  "summary": ${indent(JSON.stringify(summary, null, 2), "  ")}\n}\n`;
}

/** Akışı tek metne toplar (testler ve küçük hesaplar için). */
export async function collectExport(meta: ExportMeta, sources: readonly TableSource[]): Promise<string> {
  let out = "";
  for await (const chunk of exportChunks(meta, sources)) out += chunk;
  return out;
}
