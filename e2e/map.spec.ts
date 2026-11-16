import { expect, test, type Page } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

const IST = { lat: 41.0082, lng: 28.9784 };
const ANK = { lat: 39.9334, lng: 32.8597 };

test.describe("Haritayı Keşfet (açık kaynak altyapı)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("harita MapLibre ile yüklenir; OpenStreetMap atfı görünür", async ({ page }) => {
    await login(page, "alice", "/harita");
    await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(/OpenStreetMap/, { timeout: 20_000 });
    await page.waitForTimeout(2_000); // karoların çizilmesi için
    await page.screenshot({ path: "test-results/screens/harita-bos.png" });
  });

  test("rota API'si: İstanbul → Ankara gerçek yol mesafesi (Valhalla)", async ({ page }) => {
    await login(page, "alice");
    const res = await page.request.post("/api/maps/route", { data: { origin: IST, destination: ANK, alternatives: true } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.routes[0].distanceMeters).toBeGreaterThan(400_000);
    expect(body.routes[0].distanceMeters).toBeLessThan(520_000);
    expect(body.routes[0].durationSeconds).toBeGreaterThan(3 * 3600);
    expect(body.alternativesSupported).toBe(true);
  });

  test("API hataları anlaşılır Türkçe mesaj döner; oturumsuz erişim reddedilir", async ({ page, request }) => {
    const anon = await request.post("/api/maps/route", { data: { origin: IST, destination: ANK } });
    expect(anon.status()).toBe(401);
    expect((await anon.json()).error.message).toMatch(/giriş yap/);

    await login(page, "alice");
    const bad = await page.request.post("/api/maps/route", { data: { origin: { lat: 200, lng: 0 }, destination: ANK } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.message).toMatch(/İstek geçersiz/);
  });
});

async function hasGeoData(page: Page) {
  const res = await page.request.post("/api/maps/autocomplete", { data: { text: "ankara" } });
  if (!res.ok()) return false;
  const { suggestions } = await res.json();
  return suggestions.some((s: { kind: string }) => s.kind === "settlement");
}

test.describe("Haritayı Keşfet — uçtan uca akış (OSM verisi gerekli)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("İstanbul → Ankara rotası, rota üzerinde benzinlik, rotaya durak ekleme", async ({ page }) => {
    await login(page, "alice", "/harita");
    test.skip(!(await hasGeoData(page)), "OSM verisi henüz yüklenmedi (osm-import iş akışı)");

    const pick = async (label: string, text: string, option: RegExp) => {
      await page.getByRole("combobox", { name: label }).fill(text);
      await page.getByRole("option", { name: option }).first().click();
    };
    await pick("Başlangıç", "İstanbul", /^İstanbul/);
    await pick("Varış", "Ankara", /^Ankara/);

    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });

    await page.getByRole("button", { name: "Benzin istasyonları" }).click();
    const results = page.getByTestId("results");
    await expect(results.getByRole("button").first()).toBeVisible({ timeout: 20_000 });

    await results.getByRole("button").first().click();
    await expect(page.getByTestId("place-detail")).toBeVisible();
    await expect(page.getByTestId("detour")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "test-results/screens/harita-yer-detayi.png" });

    await page.getByRole("button", { name: "Durak olarak ekle" }).click();
    await expect(page.getByRole("combobox", { name: "1. durak" })).not.toHaveValue("");
    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: "test-results/screens/harita-rota.png" });
  });
});
