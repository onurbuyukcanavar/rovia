import { expect, test, type APIResponse } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

/**
 * "API hataları kullanıcıya anlaşılır şekilde gösteriliyor mu": her hata JSON, doğru durum kodlu,
 * Türkçe mesajlı ve iç ayrıntı (yığın izi, sağlayıcı/SQL mesajı) içermez.
 */

const SAME = { "sec-fetch-site": "same-origin" };
const TURKISH = /[çğıöşüÇĞİÖŞÜ]/;

async function expectFriendly(res: APIResponse, status: number) {
  expect(res.status(), res.url()).toBe(status);
  expect(res.headers()["content-type"] ?? "").toContain("application/json");
  const text = await res.text();
  expect(text).not.toMatch(/\bat \S+ \(|node_modules|PGRST|SQLSTATE|ZodError|stack|Unexpected token/i);
  const body = JSON.parse(text) as { error?: { message?: string } };
  expect(body.error?.message ?? "").toMatch(TURKISH);
  return body;
}

test.describe("API hataları — oturumsuz", () => {
  test("bilinmeyen /api adresi → 404 JSON", async ({ request }) => {
    for (const method of ["get", "post", "delete"] as const) {
      await expectFriendly(await request[method]("/api/olmayan/adres"), 404);
    }
    await expectFriendly(await request.get("/api/maps"), 404);
  });

  test("yanlış yöntem → 405", async ({ request }) => {
    expect((await request.get("/api/maps/route")).status()).toBe(405);
    expect((await request.put("/api/recordings/sync", { data: {} })).status()).toBe(405);
    expect((await request.post("/api/trips/00000000-0000-4000-8000-000000000000/export")).status()).toBe(405);
  });

  test("geçersiz dışa aktarma biçimi → 400", async ({ request }) => {
    await expectFriendly(await request.get("/api/trips/00000000-0000-4000-8000-000000000000/export?format=exe"), 400);
  });
});

test.describe("API hataları — oturumlu", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test.beforeEach(async ({ page }) => {
    await login(page, "alice");
  });

  test("bozuk JSON → 400 Türkçe mesaj", async ({ page }) => {
    const res = await page.request.post("/api/maps/route", {
      headers: { ...SAME, "content-type": "application/json" },
      data: "{bozuk json",
    });
    const body = await expectFriendly(res, 400);
    expect(body.error?.message).not.toContain("JSON");
  });

  test("boş gövde → 400", async ({ page }) => {
    await expectFriendly(await page.request.post("/api/maps/autocomplete", { headers: SAME }), 400);
  });

  test("çok büyük gövde → 413", async ({ page }) => {
    const res = await page.request.post("/api/maps/search", {
      headers: SAME,
      data: { mode: "suggest", encodedPolyline: "a".repeat(700 * 1024) },
    });
    await expectFriendly(res, 413);
  });

  test("geçersiz koordinatlar → anlaşılır 400", async ({ page }) => {
    const cases: [string, unknown][] = [
      ["/api/maps/route", { origin: { lat: 91, lng: 32 }, destination: { lat: 39, lng: 32 } }],
      ["/api/maps/route", { origin: { lat: "39", lng: 32 }, destination: { lat: 39, lng: 32 } }],
      ["/api/maps/route", { origin: { lat: 39, lng: 32 } }],
      ["/api/maps/reverse-geocode", { lat: 39, lng: 181 }],
      ["/api/maps/search", { mode: "nearby", category: "fuel", center: { lat: -100, lng: 0 }, radiusMeters: 1000 }],
      ["/api/maps/autocomplete", { text: "a" }],
      ["/api/maps/explore", { category: "x", bbox: [0, 0, 1, 1] }],
    ];
    for (const [path, data] of cases) {
      const body = await expectFriendly(await page.request.post(path, { headers: SAME, data }), 400);
      expect(body.error?.message).toBe("İstek geçersiz. Seçimlerini kontrol edip tekrar dene.");
    }
  });

  test("geçersiz kimlikle dışa aktarma → 404 Türkçe", async ({ page }) => {
    await expectFriendly(await page.request.get("/api/trips/abc/export?format=gpx", { headers: SAME }), 404);
  });
});
