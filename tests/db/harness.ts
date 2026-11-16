/**
 * Gerçek Postgres (PGlite/WASM) üzerinde migration ve RLS testi için ortam.
 * Supabase'in sağladığı auth/storage şemalarını ve rollerini asgari düzeyde taklit eder;
 * migration dosyaları ise değiştirilmeden, olduğu gibi uygulanır.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { postgis } from "@electric-sql/pglite-postgis";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SUPABASE_STUB = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  -- Supabase eklentileri "extensions" şemasına kurar
  create schema extensions;
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text not null,
    owner uuid,
    metadata jsonb
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;

  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  -- Supabase'in varsayılan yetkileri: public şemadaki yeni tablolar API rollerine açıktır; koruma RLS'tedir.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export async function createTestDb() {
  const db = new PGlite({ extensions: { postgis, pg_trgm } });
  await db.exec(SUPABASE_STUB);

  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

export async function createUser(db: TestDb, meta: Record<string, string> = {}) {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [`${crypto.randomUUID()}@example.test`, JSON.stringify(meta)],
  );
  return res.rows[0].id;
}

/** Sorguyu belirtilen kullanıcı olarak (authenticated rolü + JWT sub) çalıştırır. */
export async function asUser<T>(db: TestDb, userId: string | null, fn: (tx: TestDb) => Promise<T>): Promise<T> {
  const role = userId ? "authenticated" : "anon";
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
    return fn(tx as unknown as TestDb);
  });
}
