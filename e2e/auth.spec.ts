import { expect, test } from "@playwright/test";
import { hasCredentials, login, users } from "./helpers";

test.describe("kimlik doğrulama (oturumsuz)", () => {
  test("korumalı sayfa giriş sayfasına yönlendirir ve dönüş adresini korur", async ({ page }) => {
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/giris\?next=%2Fpanel$/);
    await expect(page.getByRole("heading", { name: "Tekrar hoş geldin" })).toBeVisible();
  });

  test("açık yönlendirme denemesi engellenir", async ({ page }) => {
    await page.goto("/giris?next=//evil.example.com");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/panel");
  });

  test("istemci doğrulaması: geçersiz e-posta", async ({ page }) => {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill("gecersiz");
    await page.getByLabel("Şifre", { exact: true }).fill("x");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByText("Geçerli bir e-posta adresi gir.")).toBeVisible();
  });

  test("kayıt formu zayıf şifreyi sunucuya göndermeden reddeder", async ({ page }) => {
    await page.goto("/kayit");
    await page.getByLabel("E-posta").fill("yeni.kullanici@rovia.test");
    await page.getByLabel("Şifre", { exact: true }).fill("sadeceharf");
    await page.getByRole("button", { name: "Hesap oluştur" }).click();
    await expect(page.getByText("Şifre en az bir harf ve bir rakam içermeli.")).toBeVisible();
  });
});

test.describe("kimlik doğrulama (gerçek Supabase)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("Google ile devam et: sağlayıcı kapalıysa anlaşılır mesaj, açıksa Google'a yönlendirme", async ({ page, request }) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const settings = await request.get(`${url}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! } });
    const googleEnabled = (await settings.json()).external?.google === true;

    for (const path of ["/giris", "/kayit"]) {
      await page.goto(path);
      if (googleEnabled) {
        const nav = page.waitForURL(/accounts\.google\.com/, { waitUntil: "commit" });
        await page.getByRole("button", { name: "Google ile devam et" }).click();
        await nav;
      } else {
        await page.getByRole("button", { name: "Google ile devam et" }).click();
        await expect(page).toHaveURL(/\/giris\?error=google_disabled/);
        await expect(page.getByRole("alert").filter({ hasText: "Google ile giriş şu anda kullanılamıyor" })).toBeVisible();
      }
    }
  });

  test("hatalı şifre anlaşılır Türkçe hata verir", async ({ page }) => {
    await page.goto("/giris");
    await page.getByLabel("E-posta").fill(users.alice.email);
    await page.getByLabel("Şifre", { exact: true }).fill("YanlisSifre123");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page.getByText("E-posta veya şifre hatalı.")).toBeVisible();
    await expect(page).toHaveURL(/\/giris/);
  });

  test("giriş → panel → çıkış", async ({ page }) => {
    await login(page, "alice");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("E2E");
    await expect(page.getByRole("heading", { name: "İstatistikler" })).toBeVisible();
    await expect(page.getByText("Henüz tamamlanmış bir yolculuğun yok.")).toBeVisible();

    // Oturum açıkken giriş sayfası panele yönlendirir
    await page.goto("/giris");
    await expect(page).toHaveURL(/\/panel$/);

    await page.goto("/ayarlar");
    await page.getByRole("main").getByRole("button", { name: "Oturumu kapat" }).click();
    await expect(page).toHaveURL(/\/giris$/);
    await page.goto("/panel");
    await expect(page).toHaveURL(/\/giris\?next=/);
  });

  test("giriş sonrası 'next' adresine döner", async ({ page }) => {
    await login(page, "alice", "/ayarlar");
    await expect(page.getByRole("heading", { name: "Ayarlar", level: 1 })).toBeVisible();
  });
});
