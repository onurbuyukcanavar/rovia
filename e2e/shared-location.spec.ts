import { expect, test } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

/** WhatsApp'ın konum mesajı biçimi: metin + maps.google.com bağlantısı (Galata Kulesi). */
const WHATSAPP = "Akşam burada buluşalım: https://maps.google.com/maps?q=41.025600,28.974100&z=17&hl=tr 👋";
const COORDS = "41.025600, 28.974100";

test.describe("Paylaşılan konum (/konum)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("oturum yoksa giriş sayfasına, dönüş adresi korunarak yönlendirir", async ({ page }) => {
    await page.goto(`/konum?text=${encodeURIComponent(WHATSAPP)}`);
    await expect(page).toHaveURL(/\/giris\?next=/);
    const next = new URL(page.url()).searchParams.get("next") ?? "";
    expect(next.startsWith("/konum?text=")).toBe(true);
    expect(new URLSearchParams(next.split("?")[1]).get("text")).toBe(WHATSAPP);
  });

  test.describe("oturum açık", () => {
    test.use({ geolocation: { latitude: 39.9208, longitude: 32.8541 }, permissions: ["geolocation"] });

    test("WhatsApp mesajı → işaret + ad + koordinat → Buraya rota oluştur → planlayıcıda varış dolu", async ({ page }) => {
      test.setTimeout(90_000);
      await login(page, "alice");
      await page.goto(`/konum?text=${encodeURIComponent(WHATSAPP)}`);

      await expect(page.getByTestId("shared-location-pin")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("shared-location-coords")).toHaveText(COORDS);
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).not.toHaveText(/Konum açılıyor/, { timeout: 20_000 });
      // Ters adres araması bitince ad sabitlenir (yakında yerleşim yoksa "Paylaşılan konum")
      await expect(page.getByText("Konum açılıyor…")).toHaveCount(0, { timeout: 20_000 });
      const name = (await heading.textContent())?.trim() ?? "";
      expect(name.length).toBeGreaterThan(1);
      await expect(page.getByRole("link", { name: "Google Haritalar'da aç" })).toHaveAttribute("href", /query=41\.025600%2C28\.974100/);
      await expect(page.getByRole("button", { name: "Favorilere ekle" })).toBeVisible();

      await page.getByRole("link", { name: "Buraya rota oluştur" }).click();
      await expect(page).toHaveURL(/\/planla\?.*konum=41\.025600%2C28\.974100/);
      await expect(page.getByRole("combobox", { name: "Varış" })).toHaveValue(name);
      // Başlangıç: cihaz konumu (izin verildi)
      await expect(page.getByRole("combobox", { name: "Başlangıç" })).toHaveValue(/^Konumum/, { timeout: 20_000 });
    });

    test("konum bulunamazsa hata + yapıştırma kutusu; koordinat yapıştırınca açılır", async ({ page }) => {
      await login(page, "alice");
      await page.goto(`/konum?text=${encodeURIComponent("merhaba, nasılsın?\nyarın görüşürüz")}`);
      await expect(page.getByRole("alert")).toContainText("konum bulamadık");
      const box = page.getByRole("textbox", { name: "Konum bağlantısı, mesaj ya da koordinat" });
      await box.fill("38.643100, 34.828900");
      await page.getByRole("button", { name: "Konumu aç" }).click();
      await expect(page).toHaveURL(/\/konum\?text=38\.643100/);
      await expect(page.getByTestId("shared-location-coords")).toHaveText("38.643100, 34.828900");
    });

    test("planlayıcı arama kutusuna yapıştırılan harita bağlantısı ilk öneri olur", async ({ page }) => {
      await login(page, "alice");
      await page.goto("/planla");
      const dest = page.getByRole("combobox", { name: "Varış" });
      await dest.fill("https://maps.google.com/?q=36.884100,30.705600+(E2E%20Kalei%C3%A7i)");
      const option = page.getByRole("option").first();
      await expect(option).toContainText("E2E Kaleiçi");
      await expect(option).toContainText("36.884100, 30.705600");
      await option.click();
      await expect(dest).toHaveValue("E2E Kaleiçi");
    });
  });
});
