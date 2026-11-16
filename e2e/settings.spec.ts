import { expect, test } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

test.describe("ayarlar", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("profil adı güncellenir ve kalıcıdır", async ({ page }) => {
    await login(page, "alice", "/ayarlar");
    const name = page.getByLabel("Ad Soyad");
    await name.fill("E2E Alice Güncel");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Profil güncellendi.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Ad Soyad")).toHaveValue("E2E Alice Güncel");

    await page.getByLabel("Ad Soyad").fill("E2E Alice");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByText("Profil güncellendi.")).toBeVisible();
  });

  test("kullanıcı adı benzersizdir; biçimsiz değer reddedilir", async ({ browser }) => {
    const bobCtx = await browser.newContext();
    const bob = await bobCtx.newPage();
    await login(bob, "bob", "/ayarlar");
    await bob.getByLabel("Kullanıcı adı").fill("e2e.bob");
    await bob.getByRole("button", { name: "Kaydet" }).click();
    await expect(bob.getByText("Profil güncellendi.")).toBeVisible();
    await bobCtx.close();

    const aliceCtx = await browser.newContext();
    const alice = await aliceCtx.newPage();
    await login(alice, "alice", "/ayarlar");
    await alice.getByLabel("Kullanıcı adı").fill("E2E.Bob"); // büyük harf normalize edilir → çakışma
    await alice.getByRole("button", { name: "Kaydet" }).click();
    await expect(alice.getByText("Bu kullanıcı adı alınmış.")).toBeVisible();

    await alice.getByLabel("Kullanıcı adı").fill("ab");
    await alice.getByRole("button", { name: "Kaydet" }).click();
    await expect(alice.getByText(/Kullanıcı adı 3–30 karakter olmalı/)).toBeVisible();
    await aliceCtx.close();
  });

  test("bağlı hesaplar e-posta kimliğini gösterir; Google bağlı değil", async ({ page }) => {
    await login(page, "alice", "/ayarlar");
    const accounts = page.locator("section", { has: page.getByRole("heading", { name: "Bağlı hesaplar" }) });
    await expect(accounts.getByText("E-posta ve şifre")).toBeVisible();
    await expect(accounts.getByRole("button", { name: "Bağla" })).toBeVisible();
  });
});
