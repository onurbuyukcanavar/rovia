import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E plan";

/** Test başarısız olsa da Alice'in test yolculukları temizlenir. */
async function cleanup() {
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) return;
  await sb.from("trips").delete().like("title", `${PREFIX}%`);
  await sb.from("trips").delete().eq("title", "İstanbul – Ankara");
}

async function hasGeoData(page: Page) {
  const res = await page.request.post("/api/maps/autocomplete", { data: { text: "ankara" } });
  if (!res.ok()) return false;
  const { suggestions } = await res.json();
  return suggestions.some((s: { kind: string }) => s.kind === "settlement");
}

async function pick(page: Page, label: string, text: string, option: RegExp) {
  await page.getByRole("combobox", { name: label }).fill(text);
  await page.getByRole("option", { name: option }).first().click();
}

const saveStatus = (page: Page) => page.getByTestId("trip-save-status");

test.describe("Yolculuk planlama (PHASE 3)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("yeni yolculuk: ad, tarih, ara durak → kaydet → listede → yeniden aç → düzenle → sil", async ({ page, browser }) => {
    test.setTimeout(150_000);
    await login(page, "alice", "/planla");
    test.skip(!(await hasGeoData(page)), "OSM verisi yüklü değil");

    await expect(page.getByRole("heading", { name: "Yolculuk Planla" })).toBeVisible();
    await expect(saveStatus(page)).toHaveText("Kaydetmek için başlangıç ve varış noktası seç.");

    await page.getByLabel("Yolculuk adı").fill(`${PREFIX} İstanbul – Kapadokya`);
    await page.getByLabel("Yolculuk tarihi").fill("2026-12-05");
    await page.getByLabel("Açıklama").fill("Kış yolculuğu, Tuz Gölü'nde mola.");
    await pick(page, "Başlangıç", "İstanbul", /^İstanbul/);
    await pick(page, "Varış", "Göreme", /^Göreme/);
    await page.getByRole("button", { name: "Ara durak ekle" }).click();
    await pick(page, "1. durak", "Ankara", /^Ankara/);

    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
    const distance = await page.getByTestId("route-distance").textContent();

    // Kaydedilmemiş değişiklik varken uygulama içi gezinme onay ister
    await expect(saveStatus(page)).toHaveText("Kaydedilmemiş değişiklikler var");
    // Onay penceresi tıklamayı bekletir: işleyici tıklamadan önce kurulmalı
    let dialogMessage = "";
    page.once("dialog", (dlg) => {
      dialogMessage = dlg.message();
      void dlg.dismiss();
    });
    await page.getByRole("link", { name: "Yolculuklarım" }).first().click();
    await expect.poll(() => dialogMessage).toMatch(/Kaydedilmemiş değişiklikler kaybolacak/);
    await expect(page).toHaveURL(/\/planla$/);

    await page.getByRole("button", { name: "Yolculuğu kaydet" }).click();
    await expect(saveStatus(page)).toHaveText(/Kaydedildi · \d{2}:\d{2}/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/planla\/[0-9a-f-]{36}$/);
    const tripUrl = page.url();
    await expect(page.getByRole("heading", { name: "Yolculuğu düzenle" })).toBeVisible();
    await page.screenshot({ path: "test-results/screens/planla-kaydedildi.png" });

    // Listede görünür
    await page.getByRole("link", { name: "Yolculuklarım" }).first().click();
    await expect(page).toHaveURL(/\/yolculuklar$/);
    const card = page.getByTestId("trip-card").filter({ hasText: `${PREFIX} İstanbul – Kapadokya` });
    await expect(card).toBeVisible();
    await expect(card).toContainText("5 Aralık 2026");
    await expect(card).toContainText("3 durak");
    await expect(card).toContainText(distance!.trim());
    await page.screenshot({ path: "test-results/screens/yolculuklar.png" });

    // Yeniden açınca her şey yerinde; değişiklik yok
    await page.goto(tripUrl);
    await expect(page.getByLabel("Yolculuk adı")).toHaveValue(`${PREFIX} İstanbul – Kapadokya`);
    await expect(page.getByLabel("Yolculuk tarihi")).toHaveValue("2026-12-05");
    await expect(page.getByLabel("Açıklama")).toHaveValue("Kış yolculuğu, Tuz Gölü'nde mola.");
    await expect(page.getByRole("combobox", { name: "1. durak" })).toHaveValue(/^Ankara/);
    await expect(page.getByTestId("route-distance")).toHaveText(distance!, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Değişiklikleri kaydet" })).toBeDisabled();

    // Bob bu yolculuğu açamaz (RLS)
    const bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await login(bob, "bob");
    // Not: notFound() akışla (Suspense içinde) gönderildiği için durum kodu değil içerik doğrulanır
    await bob.goto(tripUrl);
    await expect(bob.getByRole("heading", { name: "Bu yol bir yere çıkmıyor." })).toBeVisible();
    await expect(bob.getByLabel("Yolculuk adı")).toHaveCount(0);
    await bobContext.close();

    // Düzenle: ara durağı kaldır → kaydet
    await page.getByRole("button", { name: "Durağı kaldır" }).click();
    await expect(saveStatus(page)).toHaveText("Kaydedilmemiş değişiklikler var");
    await expect(page.getByTestId("route-distance")).not.toHaveText(distance!, { timeout: 30_000 });
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await expect(saveStatus(page)).toHaveText(/Kaydedildi/, { timeout: 20_000 });

    // Çakışma: başka sekmede değiştirilen yolculuk eski sürümle ezilemez
    const other = await page.context().newPage();
    await other.goto(tripUrl);
    await other.getByLabel("Yolculuk adı").fill(`${PREFIX} İkinci sekme`);
    await expect(other.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
    await other.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await expect(saveStatus(other)).toHaveText(/Kaydedildi/, { timeout: 20_000 });
    await other.close();

    await page.getByLabel("Açıklama").fill("İlk sekmeden değişiklik");
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await expect(page.getByTestId("trip-save-bar").getByRole("alert")).toContainText("başka bir sekmede ya da cihazda değiştirilmiş");

    // Sil (iki adımlı onay) — sayfadan ayrılırken onay penceresi kabul edilir
    page.once("dialog", (dlg) => void dlg.accept());
    await page.getByRole("link", { name: "Yolculuklarım" }).first().click();
    await expect(page).toHaveURL(/\/yolculuklar$/);
    const renamed = page.getByTestId("trip-card").filter({ hasText: `${PREFIX} İkinci sekme` });
    await expect(renamed).toContainText("2 durak");
    await renamed.getByRole("button", { name: /^Sil/ }).click();
    await renamed.getByRole("button", { name: "Evet, sil" }).click();
    await expect(renamed).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("trip-card").filter({ hasText: PREFIX })).toHaveCount(0);
  });

  test("Haritayı Keşfet'te oluşturulan rota yolculuk olarak kaydedilir; ad önerisi kullanılır", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "alice", "/harita");
    test.skip(!(await hasGeoData(page)), "OSM verisi yüklü değil");

    await pick(page, "Başlangıç", "İstanbul", /^İstanbul/);
    await pick(page, "Varış", "Ankara", /^Ankara/);
    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });

    await page.getByRole("button", { name: "Yolculuk olarak kaydet" }).click();
    await expect(page.getByLabel("Yolculuk adı")).toHaveAttribute("placeholder", "İstanbul – Ankara");
    await page.getByRole("button", { name: "Yolculuğu kaydet" }).click();
    await expect(saveStatus(page)).toHaveText(/Kaydedildi/, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/planla\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Yolculuk adı")).toHaveValue("İstanbul – Ankara");

    // Panelde "Yaklaşan yolculuklar" listesinde görünür ve planlayıcıya bağlanır
    await page.goto("/panel");
    await expect(page.getByRole("link", { name: "İstanbul – Ankara" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Yeni Yolculuk Planla/ })).toHaveAttribute("href", "/planla");
  });

  test("olmayan veya biçimsiz yolculuk adresi 'bulunamadı' sayfası gösterir", async ({ page }) => {
    await login(page, "alice");
    for (const path of ["/planla/00000000-0000-4000-8000-000000000000", "/planla/abc"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Bu yol bir yere çıkmıyor." })).toBeVisible();
    }
  });
});
