import { devices, expect, test } from "@playwright/test";
import { ANDROID_APK_URL } from "../src/lib/platform";
import { hasCredentials, login } from "./helpers";

/** Uygulama kurulumu: herkese açık /indir sayfası, çevrimdışı ekranı ve servis çalışanı. */
test.describe("kurulum ve çevrimdışı (oturumsuz)", () => {
  test("/indir herkese açık ve APK bağlantısını içerir", async ({ page }) => {
    const res = await page.goto("/indir");
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(/\/indir$/);
    await expect(page.getByRole("heading", { level: 1, name: "ROVIA'yı indir" })).toBeVisible();
    await expect(page.getByRole("link", { name: "APK'yı indir" })).toHaveAttribute("href", ANDROID_APK_URL);
    for (const h of ["Android uygulaması", "Android ana ekran", "iPhone / iPad ana ekran"]) {
      await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
    }
  });

  test("ana sayfa /indir'e bağlantı verir", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#icerik").getByRole("link", { name: "Uygulamayı yükle" })).toHaveAttribute("href", "/indir");
  });

  test("/offline statik olarak açılır", async ({ page }) => {
    const res = await page.goto("/offline");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Bağlantı yok" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tekrar dene" })).toBeVisible();
  });

  test("servis çalışanı kaydolur; ağ yokken gezinme çevrimdışı ekranını gösterir", async ({ page, context }) => {
    await page.goto("/indir");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    // Sayfa ilk yüklemede denetlenmiyorsa clients.claim sonrası denetlenir
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // Önbelleğe alma bitti mi?
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/offline")))).toBe(true);

    await context.setOffline(true);
    try {
      await page.goto("/gizlilik").catch(() => undefined);
      await expect(page.getByRole("heading", { level: 1, name: "Bağlantı yok" })).toBeVisible();
      await expect(page).toHaveURL(/\/gizlilik$/);
    } finally {
      await context.setOffline(false);
    }
    await page.getByRole("link", { name: "Tekrar dene" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Gizlilik Politikası ve KVKK Aydınlatma Metni" })).toBeVisible();
  });
});

test.describe("kurulum girişi (mobil)", () => {
  // defaultBrowserType bir describe içinde değiştirilemez (yeni işçi gerektirir): yalnızca öykünme ayarları
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("yüklenmemişken üst çubukta ve 'Diğer'de görünür; pencere APK bağlantısını gösterir", async ({ page }) => {
    await login(page, "alice");
    const headerButton = page.getByRole("banner").getByRole("button", { name: "Uygulamayı yükle" });
    await expect(headerButton).toBeVisible();
    const box = await headerButton.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);

    await page.goto("/diger");
    await expect(page.getByRole("heading", { level: 1, name: "Diğer" })).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: /Uygulamayı yükle/ }).click();
    const sheet = page.getByTestId("install-sheet");
    await expect(sheet.getByRole("heading", { name: "ROVIA'yı telefonuna yükle" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Android uygulamasını indir (APK)" })).toHaveAttribute("href", ANDROID_APK_URL);
    await sheet.getByRole("button", { name: "Kapat" }).click();
    await expect(sheet).toBeHidden();
  });
});
