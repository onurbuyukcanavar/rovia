import { expect, test } from "@playwright/test";

/** Google OAuth marka sayfası için gizlilik politikası ve kullanım koşulları herkese açık olmalı. */
test.describe("yasal sayfalar (oturumsuz erişim)", () => {
  for (const [path, heading, mustContain] of [
    ["/gizlilik", "Gizlilik Politikası ve KVKK Aydınlatma Metni", "Google API Hizmetleri Kullanıcı Verileri Politikası"],
    ["/privacy", "Privacy Policy", "Limited Use"],
    ["/kullanim-kosullari", "Kullanım Koşulları", "Uygulanacak hukuk"],
    ["/terms", "Terms of Service", "Governing law"],
  ] as const) {
    test(`${path} herkese açık`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page.getByText(mustContain).first()).toBeVisible();
    });
  }

  test("ana sayfa ve kayıt sayfası yasal bağlantıları içerir", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: "Gizlilik Politikası" })).toHaveAttribute("href", "/gizlilik");
    await expect(footer.getByRole("link", { name: "Kullanım Koşulları" })).toHaveAttribute("href", "/kullanim-kosullari");
    await footer.getByRole("link", { name: "Gizlilik Politikası" }).click();
    await expect(page).toHaveURL(/\/gizlilik$/);
    await page.getByRole("link", { name: "English" }).click();
    await expect(page).toHaveURL(/\/privacy$/);

    await page.goto("/kayit");
    await expect(page.getByTestId("legal-consent").getByRole("link", { name: "Kullanım Koşulları" })).toBeVisible();
  });
});
