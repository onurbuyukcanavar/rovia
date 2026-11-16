import { expect, test } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

/**
 * Yayındaki sitenin harita sağlığı: yalnızca E2E_BASE_URL verildiğinde çalışır (prod-check iş akışı).
 * Tarayıcı konsol hatalarını, başarısız ağ isteklerini ve 4xx/5xx yanıtları kayda geçirir.
 */
test.describe("yayın tanılama: harita", () => {
  test.skip(!process.env.E2E_BASE_URL || !hasCredentials, "Yalnızca yayına karşı çalışır");

  test("harita yüklenir, yer araması ve rota çalışır", async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
    page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
    page.on("response", async (r) => {
      if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.request().method()} ${r.url().slice(0, 160)} ${(await r.text().catch(() => "")).slice(0, 200)}`);
    });

    try {
      await login(page, "alice", "/harita");
      await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
      const ac = await page.request.post("/api/maps/autocomplete", { data: { text: "ankara" } });
      console.log("[diag] autocomplete", ac.status(), (await ac.text()).slice(0, 300));
      const route = await page.request.post("/api/maps/route", {
        data: { origin: { lat: 41.0082, lng: 28.9784 }, destination: { lat: 39.9334, lng: 32.8597 } },
      });
      console.log("[diag] route", route.status(), (await route.text()).slice(0, 300));

      await page.getByRole("combobox", { name: "Başlangıç" }).fill("İstanbul");
      await page.getByRole("option", { name: /^İstanbul/ }).first().click({ timeout: 15_000 });
      await page.getByRole("combobox", { name: "Varış" }).fill("Ankara");
      await page.getByRole("option", { name: /^Ankara/ }).first().click({ timeout: 15_000 });
      await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
      await page.screenshot({ path: "test-results/screens/prod-harita.png" });
    } finally {
      console.log("[diag] sorunlar:\n" + (problems.join("\n") || "(yok)"));
    }
  });
});
