import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E";
const VEHICLE = `${PREFIX} Garaj Aracı`;
const TRIP = `${PREFIX} maliyet yolculuğu`;

async function client() {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) throw error;
  return sb;
}

/** "E2E" ile başlayan araçları ve test yolculuğunu siler; hatırlanan benzin fiyatı testten önceki hâline döner. */
let savedDefaults: unknown = undefined;
async function cleanup() {
  if (!url || !key) return;
  const sb = await client().catch(() => null);
  if (!sb) return;
  await sb.from("trips").delete().eq("title", TRIP);
  await sb.from("vehicles").delete().like("name", `${PREFIX}%`);
  if (savedDefaults !== undefined) {
    const { data: me } = await sb.auth.getUser();
    await sb.from("user_settings").update({ cost_defaults: savedDefaults as never }).eq("user_id", me.user!.id);
  }
}

test.describe("ROVIA Garage ve yolculuk maliyeti (PHASE 8)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    const sb = await client();
    const { data: me } = await sb.auth.getUser();
    const { data } = await sb.from("user_settings").select("cost_defaults").eq("user_id", me.user!.id).maybeSingle();
    savedDefaults = data?.cost_defaults ?? null;
    await cleanup();
  });
  test.afterAll(cleanup);

  test("araç eklenir, menzil hesaplanır, varsayılan yapılır", async ({ page }) => {
    await login(page, "alice", "/garaj");
    await page.getByRole("button", { name: "Araç ekle" }).first().click();
    const form = page.getByTestId("vehicle-form");
    await form.getByLabel("Araç adı").fill(VEHICLE);
    await form.getByLabel(/^Marka/).fill("Fiat");
    await form.getByLabel(/^Model \(/).fill("Egea");
    await form.getByLabel("Model yılı").fill("2021");
    await form.getByLabel("Yakıt türü").selectOption("gasoline");
    await form.getByLabel(/^Ortalama tüketim/).fill("6,4");
    await form.getByLabel(/^Depo kapasitesi/).fill("50");
    const makeDefault = form.getByLabel("Varsayılan aracım olsun");
    if (await makeDefault.count()) await makeDefault.setChecked(false);
    await form.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("vehicle-modal")).toBeHidden();

    const card = page.getByTestId("vehicle-card").filter({ hasText: VEHICLE });
    await expect(card).toBeVisible();
    await expect(card.getByTestId("vehicle-range")).toHaveText("≈ 781 km");
    await expect(card).toContainText("6,4 L/100 km");

    await card.getByRole("button", { name: "Varsayılan yap" }).click();
    await expect(card.getByText("Varsayılan", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("vehicle-card").filter({ hasText: VEHICLE }).getByText("Varsayılan", { exact: true })).toBeVisible();
  });

  test("yolculuk sayfasında maliyet tahmini: 100 km × 6,4 L/100 km × 50 TL = 320 TL", async ({ page }) => {
    const sb = await client();
    const { data: me } = await sb.auth.getUser();
    const { data: trip, error } = await sb.from("trips").insert({
      user_id: me.user!.id, title: TRIP, status: "completed",
      route_polyline: "_p~iF~ps|U_ulLnnqC", route_distance_m: 100_000, route_duration_s: 3600,
    }).select("id").single();
    expect(error).toBeNull();

    await login(page, "alice", `/yolculuklar/${trip!.id}`);
    const section = page.getByTestId("trip-cost-section");
    await expect(section).toBeVisible();
    await expect(section).toContainText("Tahmindir; gerçek tüketim ve fiyatlar farklı olabilir.");
    // Varsayılan araç (önceki test) seçili gelir; yine de değerleri açıkça gir
    await section.getByLabel("Araç").selectOption({ label: VEHICLE });
    await section.getByLabel("Ortalama tüketim").fill("6,4");
    await section.getByLabel("Yakıt fiyatı").fill("50");
    await expect(section.getByTestId("cost-fuel")).toHaveText("~6,4 L ≈ 320 TL");
    await expect(section.getByTestId("cost-total")).toHaveText("≈ 320 TL");

    // Elle geçiş ücreti eklenir ve toplama girer
    await section.getByRole("button", { name: "Geçiş ücreti ekle" }).click();
    await section.getByLabel("Açıklama").fill("Köprü");
    await section.getByLabel("Köprü — Tutar (TL)").fill("110");
    await expect(section.getByTestId("cost-total")).toHaveText("≈ 430 TL");

    // Varsayımlar kalıcıdır
    await expect(section.getByText("Varsayımlar kaydedildi")).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByTestId("trip-cost-section").getByTestId("cost-total")).toHaveText("≈ 430 TL");
  });
});
