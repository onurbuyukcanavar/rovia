import path from "node:path";
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E tools";
const GPX = path.join(__dirname, "fixtures", "kapadokya-track.gpx");

/** Test yolculuklarını (içe aktarılan ve kopyası) siler. */
async function cleanup() {
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) return;
  const { data: trips } = await sb.from("trips").select("id").like("title", `${PREFIX}%`);
  for (const tr of trips ?? []) await sb.rpc("trip_delete", { p_id: tr.id, p_with_journal: true });
}

test.describe("GPX/KML içe-dışa aktarma ve rota yeniden kullanımı (PHASE 9)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("GPX içe aktar → yeni yolculuk → GPX dışa aktar → rotayı tekrar kullan", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "alice");
    const title = `${PREFIX} Göreme`;

    // Liste başlığından içe aktarma sayfası
    await page.goto("/yolculuklar");
    await page.getByTestId("import-track-link").click();
    await expect(page).toHaveURL(/\/yolculuklar\/ice-aktar$/);

    // Dosya tarayıcıda ayrıştırılır; önizleme: harita + istatistikler
    await page.getByTestId("track-file").setInputFiles(GPX);
    await expect(page.getByTestId("track-preview")).toBeVisible();
    await expect(page.getByTestId("import-distance")).toHaveText(/\d+(,\d)? km/);
    await expect(page.getByTestId("import-duration")).toHaveText("37 dk");
    await expect(page.getByTestId("import-points")).toHaveText("50");
    await expect(page.getByTestId("track-map")).toBeVisible();

    // Yeni (tamamlanmış) yolculuk olarak kaydet
    await page.getByLabel("Yolculuk adı").fill(title);
    await page.getByTestId("import-save").click();
    await expect(page).toHaveURL(/\/yolculuklar\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const tripId = page.url().split("/").pop()!;
    await expect(page.getByTestId("trip-title")).toHaveText(title);
    await expect(page.getByTestId("sum-distance")).toHaveText(/\d+(,\d)? km/);
    await expect(page.getByTestId("trip-tools")).toBeVisible();

    // GPX dışa aktarma: iz noktaları ve başlık
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-gpx").click()]);
    expect(download.suggestedFilename()).toBe("e2e-tools-goreme.gpx");
    const gpx = await readFile((await download.path())!, "utf8");
    expect(gpx).toContain("<trkpt");
    expect(gpx).toContain(`<name>${title}</name>`);

    // KML de indirilebilir (istek düzeyinde)
    const kml = await page.request.get(`/api/trips/${tripId}/export?format=kml`);
    expect(kml.ok()).toBe(true);
    expect(kml.headers()["content-type"]).toContain("kml");
    expect(await kml.text()).toContain("<LineString>");

    // Başkasının yolculuğu / geçersiz kimlik → 404
    expect((await page.request.get(`/api/trips/00000000-0000-4000-8000-000000000000/export?format=gpx`)).status()).toBe(404);

    // Rotayı tekrar kullan → yeni planlı kopya, planlayıcıda açılır
    await page.getByTestId("reuse-route").click();
    await expect(page).toHaveURL(/\/planla\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    expect(page.url()).not.toContain(tripId);
  });
});
