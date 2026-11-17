import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

async function clientFor(who: keyof typeof users) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users[who]);
  if (error) throw error;
  return sb;
}

test("oturumsuz veri indirme isteği reddedilir", async ({ request }) => {
  const res = await request.get("/api/account/export", { maxRedirects: 0 });
  expect(res.status()).toBe(401);
});

test.describe("hesap ve veriler — veri indirme (e2e-alice)", () => {
  test.skip(!hasCredentials || !url || !key, "E2E_* secret'ları veya Supabase ortamı tanımlı değil");

  test("JSON indirilir; Alice'in yolculuğunu içerir, başka kullanıcının kimliğini içermez", async ({ page }) => {
    const alice = await clientFor("alice");
    const bob = await clientFor("bob");
    const aliceId = (await alice.auth.getUser()).data.user!.id;
    const bobId = (await bob.auth.getUser()).data.user!.id;
    const { data: trip, error } = await alice.from("trips").insert({ user_id: aliceId, title: "E2E veri indirme" }).select("id").single();
    expect(error).toBeNull();

    try {
      await login(page, "alice", "/ayarlar");
      const section = page.getByTestId("settings-account");
      await expect(section.getByRole("heading", { name: "Hesap ve veriler" })).toBeVisible();

      const downloading = page.waitForEvent("download");
      await section.getByRole("button", { name: "Verilerimi indir" }).click();
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^rovia-verilerim-\d{4}-\d{2}-\d{2}\.json$/);
      const text = await readFile((await download.path())!, "utf8");
      const doc = JSON.parse(text) as {
        format: string; schemaVersion: number; exportedAt: string; account: { id: string };
        tables: Record<string, { rows: Record<string, unknown>[]; count: number }>;
      };

      expect(doc.format).toBe("rovia-account-export");
      expect(doc.schemaVersion).toBe(1);
      expect(Number.isNaN(Date.parse(doc.exportedAt))).toBe(false);
      expect(doc.account.id).toBe(aliceId);
      expect(doc.tables.trips.rows.map((r) => r.id)).toContain(trip!.id);
      expect(doc.tables.profiles.rows.map((r) => r.id)).toEqual([aliceId]);
      expect(doc.tables).not.toHaveProperty("api_rate_limits");
      for (const [name, table] of Object.entries(doc.tables)) {
        expect(table.count, name).toBe(table.rows.length);
        for (const row of table.rows) if ("user_id" in row) expect(row.user_id, name).toBe(aliceId);
      }
      expect(text).not.toContain(bobId);
      await expect(section.getByText("Dosyan indirildi.")).toBeVisible();
    } finally {
      await alice.from("trips").delete().eq("id", trip!.id);
    }
  });
});

test.describe("hesap ve veriler — hesap silme (tek kullanımlık kullanıcı)", () => {
  test.skip(!url || !key, "Supabase ortamı tanımlı değil");

  test("onay → fotoğraflar → hesap silinir, anasayfada bilgi gösterilir", async ({ page, request }) => {
    // Yalnızca e-posta onayı kapalı (otomatik onay) projelerde yeni kullanıcı oluşturulabilir; e2e-alice/bob asla silinmez.
    const settings = await request.get(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const autoconfirm = (await settings.json()).mailer_autoconfirm === true;
    test.skip(!autoconfirm, "Supabase e-posta onayı açık: servis anahtarı olmadan onaylı tek kullanımlık kullanıcı oluşturulamaz");

    const email = `e2e-silme-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@rovia.test`;
    const password = `Sil${Date.now()}x9`;
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data: signUp, error: signUpError } = await sb.auth.signUp({ email, password });
    expect(signUpError).toBeNull();
    const uid = signUp.user!.id;
    expect([users.alice.email, users.bob.email]).not.toContain(email);

    // Silinecek veri: bir yolculuk ve depoda bir fotoğraf (+ küçük resim)
    await sb.from("trips").insert({ user_id: uid, title: "Silinecek yolculuk" });
    const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    for (const p of [`${uid}/e2e.jpg`, `${uid}/e2e_t.jpg`]) {
      const up = await sb.storage.from("media").upload(p, jpeg, { contentType: "image/jpeg" });
      expect(up.error).toBeNull();
    }

    // Tarayıcıda taze giriş (last_sign_in_at son 15 dakika içinde)
    await page.goto(`/giris?next=${encodeURIComponent("/ayarlar")}`);
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page).toHaveURL(/\/ayarlar$/);

    const section = page.getByTestId("settings-account");
    await section.getByRole("button", { name: "Hesabımı sil…" }).click();
    const dialog = page.getByTestId("account-delete-dialog");
    await expect(dialog.getByText("Bu işlem geri alınamaz.", { exact: false })).toBeVisible();
    const submit = dialog.getByRole("button", { name: "Hesabımı kalıcı olarak sil" });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel(/Onaylamak için/).fill("HESABIMI SİL");
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/\/\?hesap=silindi$/, { timeout: 30_000 });
    await expect(page.getByTestId("account-deleted-banner")).toContainText("Hesabın ve tüm verilerin silindi.");
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("rovia:")))).toEqual([]);

    const again = await createClient(url, key, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password });
    expect(again.error).not.toBeNull();
    await page.goto("/ayarlar");
    await expect(page).toHaveURL(/\/giris/);
  });
});
