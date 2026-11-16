import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { strToU8, zipSync } from "fflate";
import { collectMapErrors, hasCredentials, login, mapColorCount, mapHasColor, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E fav";

/** Test başarısız olsa da Alice'in test yerleri ve yolculukları temizlenir. */
async function cleanup() {
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) return;
  await sb.from("saved_places").delete().like("name", `${PREFIX}%`);
  await sb.from("trips").delete().like("title", `${PREFIX}%`);
}

async function hasGeoData(page: Page) {
  const res = await page.request.post("/api/maps/autocomplete", { data: { text: "ankara" } });
  if (!res.ok()) return false;
  const { suggestions } = await res.json();
  return suggestions.some((s: { kind: string }) => s.kind === "settlement");
}

/** Google Takeout benzeri arşiv: "Saved" klasöründe liste CSV'si + "Maps (your places)" içinde Saved Places.json */
function takeoutZip() {
  const wantToGo = [
    "Title,Note,URL,Comment",
    `${PREFIX} Galata Kulesi,Gün batımında,https://www.google.com/maps/place/Galata+Kulesi/data=!4m2!3m1!1s0x0:0x0!3d41.025631!4d28.974167,`,
    `${PREFIX} Konumsuz Yer Qzx,,https://www.google.com/maps/place/E2E+fav+Konumsuz+Yer+Qzx/data=!4m2!3m1!1s0x0:0x1,`,
  ].join("\n");
  const saved = JSON.stringify({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [32.836956, 39.925533] },
        properties: {
          date: "2025-05-01T10:00:00Z",
          google_maps_url: "http://maps.google.com/?cid=1234567890",
          location: { name: `${PREFIX} Anıtkabir`, address: "Anıttepe, Çankaya/Ankara", country_code: "TR" },
          Comment: "Sabah erken git",
        },
      },
    ],
  });
  return Buffer.from(zipSync({
    "Takeout/Saved/Want to go.csv": strToU8(wantToGo),
    "Takeout/Maps (your places)/Saved Places.json": strToU8(saved),
    "Takeout/archive_browser.html": strToU8("<html></html>"),
  }));
}

const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Ege</name>
<Folder><name>Koylar</name>
<Placemark><name>${PREFIX} Kabak Koyu</name><description><![CDATA[Kamp <b>yeri</b>]]></description>
<Point><coordinates>29.1306,36.4617,0</coordinates></Point></Placemark>
</Folder></Document></kml>`;

async function importFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/favoriler/ice-aktar");
  await expect(page.getByRole("heading", { name: "Yerleri içe aktar" })).toBeVisible();
  await page.getByTestId("import-input").setInputFiles(file);
  await expect(page.getByTestId("import-preview")).toBeVisible({ timeout: 30_000 });
}

test.describe("Favoriler ve içe aktarma (PHASE 5)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("Google Takeout arşivi: önizleme → içe aktar → listede kaynak rozeti → tekrar aktarımda mükerrer", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "alice", "/favoriler/ice-aktar");
    await expect(page.getByText("Google Maps kayıtlı yerlerim nasıl aktarılır?")).toBeVisible();

    await importFile(page, { name: "takeout-20261116.zip", mimeType: "application/zip", buffer: takeoutZip() });
    // archive_browser.html atlanır; 3 yer bulunur, konumsuz olan aktarılamaz
    await expect(page.getByRole("heading", { name: /^3 yer bulundu · 2 tanesi aktarılmaya hazır$/ })).toBeVisible();
    await expect(page.getByText("1 yerin konumu bilinmiyor")).toBeVisible();
    const rows = page.getByTestId("import-rows");
    await expect(rows.getByRole("checkbox", { name: `${PREFIX} Konumsuz Yer Qzx` })).toBeDisabled();
    await expect(rows.getByRole("checkbox", { name: `${PREFIX} Galata Kulesi` })).toBeChecked();
    await expect(rows.locator("li").filter({ hasText: `${PREFIX} Galata Kulesi` })).toContainText("Daha sonra gideceğim");
    await page.screenshot({ path: "test-results/screens/ice-aktar-onizleme.png" });

    await page.getByTestId("import-run").click();
    await expect(page.getByTestId("import-result")).toContainText("2 yer eklendi.", { timeout: 30_000 });

    await page.getByRole("link", { name: "Favorilerime git" }).click();
    await expect(page).toHaveURL(/\/favoriler$/);
    const list = page.getByTestId("favorites-list");
    const galata = list.getByTestId("favorite-row").filter({ hasText: `${PREFIX} Galata Kulesi` });
    await expect(galata).toBeVisible();
    await expect(galata).toContainText("Google Maps");
    await expect(list.getByTestId("favorite-row").filter({ hasText: `${PREFIX} Anıtkabir` })).toBeVisible();

    // Aynı arşiv yeniden: hepsi mükerrer
    await importFile(page, { name: "takeout-20261116.zip", mimeType: "application/zip", buffer: takeoutZip() });
    await page.getByTestId("import-run").click();
    await expect(page.getByTestId("import-result")).toContainText("0 yer eklendi, 2 tanesi zaten kayıtlı olduğu için atlandı.", { timeout: 30_000 });
  });

  test("KML içe aktarma, filtreler, düzenleme, yolculuk planlama ve silme", async ({ page }) => {
    test.setTimeout(150_000);
    const errors = collectMapErrors(page);
    await login(page, "alice", "/favoriler");

    await importFile(page, { name: "ege.kml", mimeType: "application/vnd.google-earth.kml+xml", buffer: Buffer.from(kml) });
    await expect(page.getByTestId("import-rows")).toContainText("Koylar");
    await page.getByTestId("import-run").click();
    await expect(page.getByTestId("import-result")).toContainText("1 yer eklendi.", { timeout: 30_000 });
    await page.getByRole("link", { name: "Favorilerime git" }).click();

    // Harita çizilmiş olmalı
    await expect.poll(() => mapColorCount(page), { timeout: 30_000 }).toBeGreaterThan(40);

    const search = page.getByRole("searchbox", { name: "Listede ara" });
    await search.fill(PREFIX);
    await expect(page.getByTestId("favorites-count")).toHaveText("3 yer");
    // Favori noktaları gerçekten çizilir (amber #e8912d)
    await expect.poll(() => mapHasColor(page, [0xe8, 0x91, 0x2d]), { timeout: 20_000 }).toBe(true);
    expect(errors).toEqual([]);

    // Liste türü: "Daha sonra gideceğim" yalnızca Galata
    await page.getByRole("tab", { name: /Daha sonra gideceğim/ }).click();
    await expect(page.getByTestId("favorites-count")).toHaveText("1 yer");
    await page.getByRole("tab", { name: /^Tümü/ }).click();
    // Kaynak: ROVIA'da eklenenler → yalnızca KML
    await page.getByRole("combobox", { name: "Kaynak" }).selectOption("rovia");
    await expect(page.getByTestId("favorites-count")).toHaveText("1 yer");
    await expect(page.getByTestId("favorite-row")).toContainText(`${PREFIX} Kabak Koyu`);
    await expect(page.getByTestId("favorite-row")).toContainText("KML");
    await page.getByRole("combobox", { name: "Kaynak" }).selectOption("google");
    await expect(page.getByTestId("favorites-count")).toHaveText("2 yer");
    await page.getByRole("combobox", { name: "Kaynak" }).selectOption("all");

    // Düzenle: ad, kategori, not
    const kabak = page.getByTestId("favorite-row").filter({ hasText: `${PREFIX} Kabak Koyu` });
    await kabak.getByRole("button", { name: new RegExp(`${PREFIX} Kabak Koyu`) }).click();
    await expect(kabak).toContainText("Kamp yeri");
    await kabak.getByRole("button", { name: "Düzenle" }).click();
    const form = page.getByTestId("favorite-edit");
    await form.getByLabel("Ad").fill(`${PREFIX} Kabak Koyu (Fethiye)`);
    await form.getByLabel("Kategori").selectOption("camping");
    await form.getByLabel("Not").fill("Yaz aylarında kalabalık");
    await form.getByRole("button", { name: "Kaydet" }).click();
    const edited = page.getByTestId("favorite-row").filter({ hasText: `${PREFIX} Kabak Koyu (Fethiye)` });
    await expect(edited).toContainText("Kamp alanı");
    await expect(edited).toContainText("Yaz aylarında kalabalık");
    await page.screenshot({ path: "test-results/screens/favoriler.png" });

    // Kategori filtresi
    await page.getByRole("combobox", { name: "Kategori" }).selectOption("camping");
    await expect(page.getByTestId("favorites-count")).toHaveText("1 yer");
    await page.getByRole("combobox", { name: "Kategori" }).selectOption("all");

    // Yolculuk planla → varış noktası favori
    await edited.getByRole("link", { name: "Yolculuk planla" }).click();
    await expect(page).toHaveURL(/\/planla\?hedef=[0-9a-f-]{36}$/);
    await expect(page.getByRole("combobox", { name: "Varış" })).toHaveValue(`${PREFIX} Kabak Koyu (Fethiye)`);
    // "Favorilerimden ekle": boş başlangıca favori yer
    const picker = page.getByTestId("favorite-picker");
    await picker.locator("summary").click();
    await picker.getByRole("button", { name: `${PREFIX} Anıtkabir: Rotaya ekle` }).click();
    await expect(page.getByRole("combobox", { name: "Başlangıç" })).toHaveValue(`${PREFIX} Anıtkabir`);

    // Sil (iki adımlı)
    await page.goto("/favoriler");
    await page.getByRole("searchbox", { name: "Listede ara" }).fill("Kabak Koyu");
    const row = page.getByTestId("favorite-row").filter({ hasText: `${PREFIX} Kabak Koyu (Fethiye)` });
    await row.getByRole("button", { name: new RegExp(`${PREFIX} Kabak Koyu`) }).click();
    await row.getByRole("button", { name: "Sil" }).click();
    await row.getByRole("button", { name: "Evet, sil" }).click();
    await expect(page.getByText("Yer silindi.")).toBeVisible();
    await expect(page.getByTestId("favorite-row").filter({ hasText: "Kabak Koyu" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Haritada yer ekleme: arama ile ekle, aynı yer ikinci kez eklenmez; dosya hatası anlaşılır", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "alice", "/favoriler");

    // Desteklenmeyen dosya
    await page.goto("/favoriler/ice-aktar");
    await page.getByTestId("import-input").setInputFiles({ name: "notlar.txt", mimeType: "text/plain", buffer: Buffer.from("merhaba") });
    await expect(page.getByText("Bu dosya türü desteklenmiyor.", { exact: false })).toBeVisible();

    await page.goto("/favoriler");
    test.skip(!(await hasGeoData(page)), "OSM verisi yüklü değil");
    for (let round = 0; round < 2; round++) {
      await page.getByRole("button", { name: "Yer ekle" }).click();
      await page.getByRole("combobox", { name: "Yer ara" }).fill("Ankara");
      await page.getByRole("option", { name: /^Ankara/ }).first().click();
      const form = page.getByTestId("candidate-form");
      await form.getByLabel("Ad").fill(`${PREFIX} Ankara merkezi`);
      await form.getByText("Daha sonra gideceğim").click();
      await form.getByRole("button", { name: "Kaydet" }).click();
      await expect(page.getByText(round === 0 ? "“Daha sonra gideceğim” listene eklendi." : "Bu yer zaten kayıtlı.")).toBeVisible({ timeout: 20_000 });
    }
    await page.getByRole("searchbox", { name: "Listede ara" }).fill("Ankara merkezi");
    await expect(page.getByTestId("favorites-count")).toHaveText("1 yer");
  });

  test("Haritayı Keşfet: yer ayrıntısından favorilere ekle", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "alice", "/harita");
    test.skip(!(await hasGeoData(page)), "OSM verisi yüklü değil");
    // Rota boyunca arama (harita merkezine bağlı değil; kararlı)
    for (const [label, text] of [["Başlangıç", "İstanbul"], ["Varış", "Ankara"]] as const) {
      await page.getByRole("combobox", { name: label }).fill(text);
      await page.getByRole("option", { name: new RegExp(`^${text}`) }).first().click();
    }
    await expect(page.getByTestId("route-distance")).toHaveText(/\d+ km/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Benzin istasyonları" }).click();
    const results = page.getByTestId("results");
    await expect(results.getByRole("button").first()).toBeVisible({ timeout: 20_000 });
    await results.getByRole("button").first().click();
    const detail = page.getByTestId("place-detail");
    await expect(detail).toBeVisible();
    const name = (await detail.getByRole("heading").first().textContent())?.trim() ?? "";

    const actions = page.getByTestId("favorite-actions");
    await actions.getByRole("button", { name: "Favorilere ekle" }).click();
    await expect(actions).toContainText("Kayıtlı · Favoriler", { timeout: 20_000 });

    // Temizlik: test adıyla eklenmediği için burada sil
    await page.goto("/favoriler");
    await page.getByRole("searchbox", { name: "Listede ara" }).fill(name);
    const row = page.getByTestId("favorite-row").filter({ hasText: name }).first();
    await expect(row).toContainText("Harita");
    await row.getByRole("button", { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).click();
    await row.getByRole("button", { name: "Sil" }).click();
    await row.getByRole("button", { name: "Evet, sil" }).click();
    await expect(page.getByText("Yer silindi.")).toBeVisible();
  });
});
