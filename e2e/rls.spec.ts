import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

async function clientFor(who: keyof typeof users) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users[who]);
  if (error) throw error;
  return sb;
}

/** Gerçek PostgREST API'si üzerinden kullanıcı izolasyonu (tarayıcıdaki publishable anahtar ile). */
test.describe("RLS — gerçek API", () => {
  test.skip(!hasCredentials || !url || !key, "E2E_* secret'ları veya Supabase ortamı tanımlı değil");

  test("kullanıcılar birbirinin yolculuğunu göremez/değiştiremez", async () => {
    const alice = await clientFor("alice");
    const bob = await clientFor("bob");
    const { data: me } = await alice.auth.getUser();

    const { data: trip, error } = await alice.from("trips").insert({ user_id: me.user!.id, title: "E2E RLS testi" }).select("id").single();
    expect(error).toBeNull();

    try {
      const read = await bob.from("trips").select("id").eq("id", trip!.id);
      expect(read.data).toEqual([]);

      const upd = await bob.from("trips").update({ title: "hack" }).eq("id", trip!.id).select("id");
      expect(upd.data).toEqual([]);

      const del = await bob.from("trips").delete().eq("id", trip!.id).select("id");
      expect(del.data).toEqual([]);

      const forged = await bob.from("trips").insert({ user_id: me.user!.id, title: "sahte" });
      expect(forged.error?.code).toBe("42501");

      const still = await alice.from("trips").select("title").eq("id", trip!.id).single();
      expect(still.data?.title).toBe("E2E RLS testi");
    } finally {
      await alice.from("trips").delete().eq("id", trip!.id);
    }
  });

  test("anonim istemci tablolara erişemez", async () => {
    const anon = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await anon.from("profiles").select("id");
    expect(error?.code).toBe("42501");
  });
});
