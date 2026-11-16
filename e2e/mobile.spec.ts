import { expect, test } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

test.describe("mobil", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("alt menü görünür; 'Diğer' tüm bölümleri listeler", async ({ page }) => {
    await login(page, "alice");
    const nav = page.getByRole("navigation", { name: "Alt menü" });
    await expect(nav).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ana menü" })).toBeHidden();

    await nav.getByRole("link", { name: "Diğer" }).click();
    await expect(page).toHaveURL(/\/diger$/);
    // Sayfa geçişi bitmeden önceki sayfanın metinleri DOM'da kalabilir: yeni başlığı bekle, yalnızca menü listesinde ara
    await expect(page.getByRole("heading", { level: 1, name: "Diğer" })).toBeVisible();
    const menu = page.getByRole("main").getByRole("list");
    for (const label of ["Genel Bakış", "Haritayı Keşfet", "Yolculuk Planla", "Seyahatnamelerim", "ROVIA Garage", "Ayarlar"]) {
      await expect(menu.getByText(label, { exact: true })).toBeVisible();
    }
    // PHASE 2 ile Haritayı Keşfet etkin: bağlantı olarak görünmeli
    await expect(menu.getByRole("link", { name: "Haritayı Keşfet" })).toBeVisible();
  });
});
