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
    for (const label of ["Genel Bakış", "Yolculuk Planla", "Seyahatnamelerim", "ROVIA Garage", "Ayarlar"]) {
      await expect(page.getByRole("main").getByText(label, { exact: true })).toBeVisible();
    }
  });
});
