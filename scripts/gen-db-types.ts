/**
 * Migration'ları geçici bir Postgres'e (PGlite) uygular ve public şemadan
 * supabase-js uyumlu `Database` tipini üretir: src/lib/database.types.ts
 * Supabase projesi bağlandıktan sonra `supabase gen types` ile de üretilebilir;
 * bu betik çevrimdışı ve CI'da şema ile tiplerin senkron kalmasını garanti eder.
 */
import { writeFileSync } from "node:fs";
import { createTestDb } from "../tests/db/harness";

const PG_TO_TS: Record<string, string> = {
  uuid: "string", text: "string", "character varying": "string", date: "string",
  "timestamp with time zone": "string", "timestamp without time zone": "string",
  integer: "number", bigint: "number", smallint: "number", numeric: "number",
  real: "number", "double precision": "number", boolean: "boolean",
  jsonb: "Json", json: "Json", ARRAY: "string[]",
};

async function main() {
  const db = await createTestDb();
  const cols = await db.query<{
    table_name: string; column_name: string; data_type: string;
    is_nullable: "YES" | "NO"; column_default: string | null; is_identity: "YES" | "NO";
  }>(`select table_name, column_name, data_type, is_nullable, column_default, is_identity
      from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`);

  const tables = new Map<string, typeof cols.rows>();
  for (const c of cols.rows) {
    if (!tables.has(c.table_name)) tables.set(c.table_name, []);
    tables.get(c.table_name)!.push(c);
  }

  const fns = await db.query<{ name: string; result: string }>(`
    select p.proname as name, pg_get_function_result(p.oid) as result
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname not in ('set_updated_at','enforce_parent_owner','handle_new_user')
    order by 1`);

  const ts = (t: string) => PG_TO_TS[t] ?? "unknown";
  let out = `// OTOMATİK ÜRETİLDİ — elle düzenlemeyin. Üretmek için: npm run db:types\n`;
  out += `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\n`;
  out += `export type Database = {\n  public: {\n    Tables: {\n`;
  for (const [name, columns] of tables) {
    const row = columns.map((c) => `          ${c.column_name}: ${ts(c.data_type)}${c.is_nullable === "YES" ? " | null" : ""};`).join("\n");
    const ins = columns.map((c) => {
      const optional = c.is_nullable === "YES" || c.column_default !== null || c.is_identity === "YES";
      return `          ${c.column_name}${optional ? "?" : ""}: ${ts(c.data_type)}${c.is_nullable === "YES" ? " | null" : ""};`;
    }).join("\n");
    const upd = columns.map((c) => `          ${c.column_name}?: ${ts(c.data_type)}${c.is_nullable === "YES" ? " | null" : ""};`).join("\n");
    out += `      ${name}: {\n        Row: {\n${row}\n        };\n        Insert: {\n${ins}\n        };\n        Update: {\n${upd}\n        };\n        Relationships: [];\n      };\n`;
  }
  out += `    };\n    Views: { [_ in never]: never };\n    Functions: {\n`;
  for (const f of fns.rows) out += `      ${f.name}: { Args: Record<string, never>; Returns: ${f.result === "jsonb" ? "Json" : "unknown"} };\n`;
  out += `    };\n    Enums: { [_ in never]: never };\n    CompositeTypes: { [_ in never]: never };\n  };\n};\n\n`;
  out += `type PublicSchema = Database["public"];\nexport type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];\n`;
  out += `export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];\n`;
  out += `export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];\n`;

  writeFileSync("src/lib/database.types.ts", out);
  console.log(`✓ ${tables.size} tablo, ${fns.rows.length} fonksiyon → src/lib/database.types.ts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
