import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E rt";

const GEBZE = { lat: 40.8027, lng: 29.4307 };
const YALOVA = { lat: 40.655, lng: 29.276 };

type Route = {
  distanceMeters: number; hasToll: boolean; hasFerry: boolean; hasHighway: boolean; tollBridges: string[];
  steps: { instruction: string; kind: string }[];
};

async function cleanup() {
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) return;
  await sb.from("trips").delete().like("title", `${PREFIX}%`);
}

async function raw(page: Page, options: Record<string, boolean>, origin = GEBZE, destination = YALOVA) {
  // Herkese açık rota sunucusu saniyede 1 istek ister
  await page.waitForTimeout(1_200);
  return page.request.post("/api/maps/route", { data: { origin, destination, alternatives: true, options }, timeout: 90_000 });
}

async function route(page: Page, options: Record<string, boolean> = {}, origin = GEBZE, destination = YALOVA) {
  const res = await raw(page, options, origin, destination);
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()).routes as Route[];
}

async function hasGeoData(page: Page) {
  const res = await page.request.post("/api/maps/autocomplete", { data: { text: "ankara" } });
  if (!res.ok()) return false;
  const { suggestions } = await res.json();
  return suggestions.some((s: { kind: string }) => s.kind === "settlement");
}

async function pick(page: Page, label: string, text: string, option: RegExp) {
  await page.getByRole("combobox", { name: label }).fill(text);
  await page.getByRole("option", { name: option }).first().click();
}

test.describe("Rota seçenekleri, feribot ve öneriler", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("Gebze → Yalova: Eskihisar–Topçular feribotu sunulur; ücretli yoldan kaçınınca feribot korunur", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "alice");

    // Varsayılan: en hızlısı Osmangazi Köprüsü (ücretli); feribot alternatif olarak gelir
    const def = await route(page);
    expect(def.some((r) => r.hasFerry)).toBe(true);
    const ferry = def.find((r) => r.hasFerry)!;
    expect(ferry.hasToll).toBe(false); // feribot ücreti "ücretli yol" sayılmaz
    const ferrySteps = ferry.steps.filter((s) => s.kind === "ferry");
    expect(ferrySteps.length, JSON.stringify(ferry.steps.slice(0, 15))).toBeGreaterThan(0);
    expect(ferry.steps[0].instruction).toMatch(/[a-zçğıöşü]/i); // Türkçe yol tarifi

    // Ücretli yollardan kaçın: hiçbir rota ücretli yol içermez, feribotlu rota ilk sırada (116 km'lik dolambaç değil)
    const noToll = await route(page, { avoidTolls: true });
    expect(noToll.every((r) => !r.hasToll)).toBe(true);
    expect(noToll[0].hasFerry).toBe(true);
    expect(noToll[0].distanceMeters).toBeLessThan(45_000);

    // Ücretli yol + feribot kaçın: ikisi de yok
    const neither = await route(page, { avoidTolls: true, avoidFerries: true });
    expect(neither.every((r) => !r.hasToll && !r.hasFerry)).toBe(true);

    // Otoyoldan kaçın
    const noHighway = await route(page, { avoidHighways: true });
    expect(noHighway.every((r) => !r.hasHighway)).toBe(true);
  });

  test("üç seçenek birden: Tekirdağ → Bursa köprü üzerinden makul rota; İstanbul içi köprü; mümkün değilse 'Uygun rota bulunamamaktadır'", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "alice");
    const all = { avoidTolls: true, avoidHighways: true, avoidFerries: true };

    // Önceden Kazakistan üzerinden 15.718 km dönüyordu
    const tb = await route(page, all, { lat: 40.978, lng: 27.511 }, { lat: 40.195, lng: 29.06 });
    console.log("[Tekirdağ→Bursa üçü birden]", tb.map((r) => `${(r.distanceMeters / 1000).toFixed(0)} km köprü=${r.tollBridges.join(",")}`).join(" | "));
    expect(tb[0].distanceMeters).toBeLessThan(500_000);
    expect(tb.every((r) => !r.hasToll && !r.hasHighway && !r.hasFerry)).toBe(true);
    expect(tb[0].tollBridges.some((b) => /15 Temmuz|Fatih Sultan Mehmet/.test(b))).toBe(true);

    // İstanbul içinde Boğaz geçişi ücretli yoldan kaçınırken köprüden
    const kb = await route(page, { avoidTolls: true }, { lat: 40.990, lng: 29.028 }, { lat: 41.043, lng: 29.007 });
    expect(kb[0].distanceMeters).toBeLessThan(40_000);
    expect(kb[0].tollBridges.length).toBeGreaterThan(0);

    // Feribotsuz adaya yol yok
    const res = await raw(page, { avoidFerries: true }, { lat: 40.146, lng: 26.405 }, { lat: 39.836, lng: 26.067 });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("no_suitable_route");
    expect(body.error.message).toMatch(/^Uygun rota bulunamamaktadır/);
  });

  test("planlayıcı: seçenek kaydedilir ve geri gelir; yol tarifi; rota üzerindeki öneriden durak ekleme", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "alice", "/planla");
    test.skip(!(await hasGeoData(page)), "OSM verisi yüklü değil");

    await page.getByLabel("Yolculuk adı").fill(`${PREFIX} Gebze – Yalova`);
    await pick(page, "Başlangıç", "Gebze", /^Gebze/);
    await pick(page, "Varış", "Yalova", /^Yalova/);
    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });

    // Ücretli yollardan kaçın → feribotlu rota seçili, rozet ve yol tarifinde feribot
    await page.getByTestId("route-options").getByText("Ücretli yollardan kaçın").click();
    await expect(page.getByTestId("route-summary")).toBeVisible();
    await expect(page.getByText("Feribot içerir")).toBeVisible({ timeout: 30_000 });
    const directions = page.getByTestId("route-directions");
    await directions.locator("summary").click();
    await expect(directions.getByRole("button").filter({ hasText: /Eskihisar|Topçular|Feribot/i }).first()).toBeVisible();
    await directions.getByRole("button").first().click(); // adım haritada gösterilir
    await page.screenshot({ path: "test-results/screens/rota-feribot.png" });

    await page.getByRole("button", { name: "Yolculuğu kaydet" }).click();
    await expect(page.getByTestId("trip-save-status")).toHaveText(/Kaydedildi/, { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId("route-options").getByRole("checkbox", { name: "Ücretli yollardan kaçın" })).toBeChecked();
    await expect(page.getByText("Feribot içerir")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("trip-save-status")).not.toHaveText("Kaydedilmemiş değişiklikler var");

    // Uzun rotada öneriler: İstanbul → Ankara
    await page.goto("/planla");
    await pick(page, "Başlangıç", "İstanbul", /^İstanbul/);
    await pick(page, "Varış", "Ankara", /^Ankara/);
    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
    const sug = page.getByTestId("route-suggestions");
    await expect(sug).toBeVisible({ timeout: 30_000 });
    await expect(sug.getByTestId("suggestion").first().or(sug.getByText("Bu rotada öne çıkan bir yer bulunamadı."))).toBeVisible({ timeout: 30_000 });
    const count = await sug.getByTestId("suggestion").count();
    console.log("[öneriler İstanbul→Ankara]", (await sug.getByTestId("suggestion").allInnerTexts()).map((x) => x.replace(/\s+/g, " ")).join(" | "));
    expect(count).toBeLessThanOrEqual(6);
    if (count > 0) {
      await expect(page.getByTestId("suggestion-marker")).toHaveCount(count);
      const name = (await sug.getByTestId("suggestion").first().locator("span.truncate").first().textContent())?.trim() ?? "";
      await sug.getByRole("button", { name: /Rotaya ekle/ }).first().click();
      await expect(page.getByRole("combobox", { name: "1. durak" })).toHaveValue(name);
      await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
      // Eklenen yer artık önerilmez
      await expect(sug.getByTestId("suggestion").filter({ hasText: name })).toHaveCount(0, { timeout: 30_000 });
      await page.screenshot({ path: "test-results/screens/rota-oneriler.png" });
    }
    // Öneriler gizlenebilir
    await sug.getByRole("button", { name: "Önerileri gizle" }).click();
    await expect(page.getByTestId("route-suggestions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rota üzerindeki önerileri göster" })).toBeVisible();
  });
});
