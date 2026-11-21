/**
 * Pazarlama ekran görüntüleri (scripts/marketing/*) için ortak ayarlar.
 * Gizli bilgi yok: e-posta sabit, şifre yalnızca DEMO_PASSWORD ortam değişkeninden okunur ve hiçbir yere yazılmaz.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const DEMO_EMAIL = "demo@roviaroad.com";
export const DEMO_NAME = "Deniz Yılmaz";
export const DEMO_USERNAME = "deniz.yol";
export const BASE_URL = (process.env.BASE_URL || "https://www.roviaroad.com").replace(/\/$/, "");
export const OUT_DIR = process.env.MARKETING_OUT || "marketing-out";
/** Seed betiğinin ürettiği kimlikler (gizli değildir); shots.ts okur. */
export const SEED_FILE = `${OUT_DIR}/seed.json`;

export type Db = SupabaseClient<Database>;

export function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`::error::${name} ortam değişkeni tanımlı değil`);
    process.exit(1);
  }
  return v;
}

export const supabaseConfig = () => ({
  url: env("NEXT_PUBLIC_SUPABASE_URL"),
  key: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
});

export function demoPassword(): string {
  const p = process.env.DEMO_PASSWORD;
  if (!p) {
    console.error("::error::DEMO_PASSWORD secret tanımlı değil (Settings → Secrets and variables → Actions).");
    process.exit(1);
  }
  return p;
}

export function newClient(): Db {
  const { url, key } = supabaseConfig();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Demo hesabıyla oturum açmış istemci; açılamazsa hata mesajıyla birlikte null. */
export async function signIn(): Promise<{ db: Db; userId: string } | { db: Db; error: string; code?: string }> {
  const db = newClient();
  const { data, error } = await db.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword() });
  if (error || !data.user) return { db, error: error?.message ?? "no user", code: error?.code };
  if (data.user.email?.toLowerCase() !== DEMO_EMAIL) throw new Error("Beklenmeyen hesap: demo dışı bir hesapta işlem yapılmaz");
  return { db, userId: data.user.id };
}

export function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

export function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Zaman aşımı/ağ hatalarında birkaç kez yeniden dener. */
export async function retry<T>(label: string, fn: () => Promise<T>, attempts = 3, waitMs = 3_000): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      log(`  ! ${label} (deneme ${i}/${attempts}): ${e instanceof Error ? e.message : String(e)}`);
      if (i < attempts) await sleep(waitMs * i);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export type SeedResult = {
  userId: string;
  plannedTripId: string | null;
  completedTripId: string | null;
  secondTripId: string | null;
  travelogueId: string | null;
  entryIds: string[];
  createdAt: string;
};
