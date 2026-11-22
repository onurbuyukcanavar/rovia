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
    // Etkin fazların bölümleri bağlantı olarak görünür (PHASE 2: harita, PHASE 3: planlama ve yolculuklar)
    await expect(menu.getByRole("link", { name: "Haritayı Keşfet" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Yolculuk Planla" })).toBeVisible();

    // Alt menüde harita yerine ROVIA Explore sekmesi var (Harita "Diğer"de)
    await expect(nav.getByRole("link", { name: "Harita", exact: true })).toHaveCount(0);
    await nav.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/kesfet$/);

    // Alt menüdeki "Yolculuklar" sekmesi yolculuk listesini açar
    await nav.getByRole("link", { name: "Yolculuklar" }).click();
    await expect(page).toHaveURL(/\/yolculuklar$/);
    await expect(page.getByRole("heading", { level: 1, name: "Yolculuklarım" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Yeni yolculuk planla" })).toBeVisible();
  });
});
