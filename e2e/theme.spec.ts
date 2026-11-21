import { expect, test } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

/**
 * Tema tercihi hesaba kaydedilir: başka bir cihaz (çerezsiz tarayıcı) açılışta aynı temayı alır.
 * Bob ile çalışır (görsel renk denetimi yapan testler Alice'i kullanır) ve sonunda Koyu'ya geri döner.
 */
test.describe("tema — hesapta saklanır, her cihazda aynı", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("Aydınlık seçilir, çerez silinince hesaptan geri gelir; hızlı düğme Koyu'ya döndürür", async ({ page, context }, info) => {
    test.skip(info.project.name !== "desktop", "Hesap durumunu değiştirir: tek projede çalışır");
    await login(page, "bob");
    const html = page.locator("html");
    try {
      await page.goto("/ayarlar");
      await page.getByTestId("theme-picker").getByText("Aydınlık", { exact: true }).click();
      await expect(html).toHaveAttribute("data-theme", "light");
      // Sunucu eylemi bitsin: kayıt yapılmadan çerez silinirse test anlamını yitirir
      await expect.poll(async () => (await context.cookies()).find((c) => c.name === "rovia-theme")?.value).toBe("light");
      await page.waitForLoadState("networkidle");

      // "Başka cihaz": tema çerezi yok → varsayılan koyu açılır, hesap tercihi aydınlığa çevirir
      await context.clearCookies({ name: "rovia-theme" });
      await page.goto("/panel");
      await expect(html).toHaveAttribute("data-theme", "light", { timeout: 15_000 });
      expect((await context.cookies()).find((c) => c.name === "rovia-theme")?.value).toBe("light");

      // Kenar menüsündeki hızlı düğme
      await page.getByTestId("theme-toggle").click();
      await expect(html).toHaveAttribute("data-theme", "dark");
    } finally {
      await page.goto("/ayarlar");
      await page.getByTestId("theme-picker").getByText("Koyu", { exact: true }).click();
      await expect(html).toHaveAttribute("data-theme", "dark");
      await page.waitForLoadState("networkidle");
    }
  });
});
