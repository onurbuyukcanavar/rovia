"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabaseConfig } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Tarayıcı istemcisi (tekil). Yalnızca publishable anahtar kullanır; yetki RLS ile sınırlıdır. */
export function getBrowserClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("SUPABASE_NOT_CONFIGURED");
  client ??= createBrowserClient<Database>(config.url, config.key);
  return client;
}
