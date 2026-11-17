"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isSignInFresh, mapDeleteError, MEDIA_BATCH_SIZE, normalizeConfirm, REAUTH_REDIRECT, type DeleteErrorCode,
} from "@/lib/account/delete";

type Db = Awaited<ReturnType<typeof createClient>>;
export type AccountActionResult<T = object> = ({ status: "ok" } & T) | { status: "error"; code: DeleteErrorCode };

const fail = (code: DeleteErrorCode) => ({ status: "error", code }) as const;

/**
 * Her adımda yeniden doğrulanır: oturum (sunucudan getUser), onay ifadesi ve son girişin tazeliği.
 * Böylece bu eylemler tek başına çağrılsa bile yalnızca oturumdaki kullanıcının, bilinçli onayıyla çalışır.
 */
async function guard(confirm: unknown): Promise<{ db: Db; uid: string } | { error: DeleteErrorCode }> {
  if (typeof confirm !== "string" || !normalizeConfirm(confirm)) return { error: "confirm" };
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { error: "reauth_required" };
  if (!isSignInFresh(data.user.last_sign_in_at)) return { error: "reauth_required" };
  return { db, uid: data.user.id };
}

/** `<uid>/` klasöründeki dosya yolları (alt klasörler dahil), en fazla `max` adet. */
async function listMedia(db: Db, uid: string, max: number): Promise<string[]> {
  const out: string[] = [];
  const queue = [uid];
  while (queue.length && out.length < max) {
    const prefix = queue.shift()!;
    for (let offset = 0; out.length < max; ) {
      const { data, error } = await db.storage.from("media").list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`media_list: ${error.message}`);
      const items = data ?? [];
      for (const it of items) {
        const path = `${prefix}/${it.name}`;
        if (it.id === null) queue.push(path); // klasör
        else if (out.length < max) out.push(path);
      }
      if (items.length < 1000) break;
      offset += items.length;
    }
  }
  return out;
}

/** 1. adım: oturum tazeliği + silinecek fotoğraf dosyası sayısı (ilerleme göstergesi için). */
export async function prepareAccountDeletion(confirm: string): Promise<AccountActionResult<{ mediaCount: number }>> {
  const g = await guard(confirm);
  if ("error" in g) return fail(g.error);
  try {
    const paths = await listMedia(g.db, g.uid, 100_000);
    return { status: "ok", mediaCount: paths.length };
  } catch (e) {
    console.error("[rovia] hesap silme hazırlık:", e instanceof Error ? e.message : e);
    return fail("media");
  }
}

/** 2. adım: kullanıcının kendi klasöründen en fazla 100 dosya siler (sahip silme politikası, çerez oturumu). */
export async function deleteMediaBatch(confirm: string): Promise<AccountActionResult<{ removed: number; done: boolean }>> {
  const g = await guard(confirm);
  if ("error" in g) return fail(g.error);
  try {
    const paths = await listMedia(g.db, g.uid, MEDIA_BATCH_SIZE);
    if (paths.length === 0) return { status: "ok", removed: 0, done: true };
    const { data, error } = await g.db.storage.from("media").remove(paths);
    if (error) throw new Error(`media_remove: ${error.message}`);
    const removed = data?.length ?? 0;
    // Hiçbir dosya silinemiyorsa sonsuz döngüye girmemek için hata verilir
    if (removed === 0) return fail("media_remaining");
    return { status: "ok", removed, done: false };
  } catch (e) {
    console.error("[rovia] hesap silme fotoğraf:", e instanceof Error ? e.message : e);
    return fail("media");
  }
}

/** 3. adım: account_delete RPC (tazelik + boş klasör veritabanında da denetlenir), ardından oturumu kapatır. */
export async function finalizeAccountDeletion(confirm: string): Promise<AccountActionResult> {
  const g = await guard(confirm);
  if ("error" in g) return fail(g.error);
  const phrase = normalizeConfirm(confirm)!;
  // account_delete henüz üretilmiş tiplerde yok (20261117000500 göçü); imza göçle birebir.
  const rpc = g.db.rpc.bind(g.db) as unknown as (fn: "account_delete", args: { p_confirm: string }) => PromiseLike<{ error: { message: string; code?: string } | null }>;
  const { error } = await rpc("account_delete", { p_confirm: phrase });
  if (error) {
    const code = mapDeleteError(error.message);
    if (code === "failed") console.error("[rovia] hesap silinemedi:", error.code ?? error.message);
    return fail(code);
  }
  // Kullanıcı artık yok: yerel oturum çerezleri temizlenir (sunucu tarafı 401/404 hatası yok sayılır).
  const { error: signOutError } = await g.db.auth.signOut({ scope: "local" });
  if (signOutError) console.error("[rovia] silme sonrası oturum kapatma:", signOutError.message);
  return { status: "ok" };
}

/** Oturum eskiyse: çıkış yap ve dönüşte ayarlara gelecek şekilde giriş sayfasına yönlendir. */
export async function signOutForReauth(): Promise<void> {
  const db = await createClient();
  const { error } = await db.auth.signOut();
  if (error) console.error("[rovia] Oturum kapatılamadı:", error.message);
  redirect(REAUTH_REDIRECT);
}
