import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E kayıt";
const START = { latitude: 41.0082, longitude: 28.9784 };

async function alice() {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) throw error;
  return sb;
}

/** Test başarısız olsa da: süren kaydı iptal et, test yolculuklarını sil. */
async function cleanup() {
  if (!url || !key) return;
  const sb = await alice();
  const { data: active } = await sb.from("trip_recordings").select("id").in("status", ["recording", "paused"]);
  for (const r of active ?? []) await sb.rpc("recording_cancel", { p_id: r.id });
  await sb.from("trips").delete().like("title", `${PREFIX}%`);
}

/** Kuzeye doğru sürüş: her adım ~22 m (1 sn'de ~80 km/sa). */
async function drive(context: BrowserContext, from: { latitude: number; longitude: number }, steps: number, startIndex = 0) {
  for (let i = 1; i <= steps; i++) {
    await context.setGeolocation({ latitude: from.latitude + (startIndex + i) * 0.0002, longitude: from.longitude, accuracy: 8 });
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const km = async (page: Page, testId: string) => {
  const text = (await page.getByTestId(testId).textContent()) ?? "";
  return Number(text.replace(/[^\d,]/g, "").replace(",", "."));
};

test.describe("GPS yolculuk kaydı (PHASE 4)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.use({ permissions: ["geolocation"], geolocation: { ...START, accuracy: 8 } });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("başlat → sürüş → duraklat → çevrimdışı devam → yenile → tamamla → özet → sil", async ({ page, context }) => {
    test.setTimeout(180_000);
    await login(page, "alice", "/kayit-modu");
    await expect(page.getByTestId("recorder-idle")).toBeVisible();
    await expect(page.getByText("Arka planda kayıt hakkında")).toBeVisible();

    await page.getByLabel("Yolculuk adı").fill(`${PREFIX} Tarihi Yarımada`);
    await page.getByRole("button", { name: "Kaydı Başlat" }).click();
    await expect(page.getByTestId("rec-status")).toHaveText("Kaydediliyor");
    await expect(page.getByTestId("rec-elapsed")).toHaveText(/0:00:0\d/);

    await drive(context, START, 20);
    await expect.poll(() => km(page, "rec-distance"), { timeout: 10_000 }).toBeGreaterThanOrEqual(0.3);
    await expect(page.getByTestId("rec-location")).not.toContainText("Konum alınıyor");
    await expect(page.getByTestId("rec-sync")).toHaveText("Tüm veriler kaydedildi", { timeout: 30_000 });

    // Duraklat: konum değişse de mesafe artmaz
    await page.getByRole("button", { name: "Duraklat" }).click();
    await expect(page.getByTestId("rec-status")).toHaveText("Duraklatıldı");
    const pausedKm = await km(page, "rec-distance");
    await drive(context, START, 5, 40);
    expect(await km(page, "rec-distance")).toBe(pausedKm);

    // Çevrimdışı devam: veriler cihazda birikir, bağlantı gelince gönderilir
    await context.setOffline(true);
    await page.getByRole("button", { name: "Devam et" }).click();
    await expect(page.getByTestId("rec-status")).toHaveText("Kaydediliyor");
    await drive(context, START, 20, 45);
    await expect(page.getByTestId("rec-sync")).toContainText("Çevrimdışı", { timeout: 15_000 });
    await expect.poll(() => km(page, "rec-distance")).toBeGreaterThan(pausedKm + 0.3);
    await context.setOffline(false);
    await expect(page.getByTestId("rec-sync")).toHaveText(/Tüm veriler kaydedildi|işlem gönderilmeyi bekliyor/, { timeout: 30_000 });

    // Sayfa yenilense de kayıt cihazdaki veriden kurtarılır
    const beforeReload = await km(page, "rec-distance");
    await page.reload();
    await expect(page.getByText("Yarım kalan kaydın kurtarıldı")).toBeVisible();
    await expect(page.getByTestId("rec-status")).toHaveText("Kaydediliyor");
    expect(await km(page, "rec-distance")).toBe(beforeReload);
    await drive(context, START, 5, 65);
    await page.screenshot({ path: "test-results/screens/kayit-modu.png" });

    // Tamamla → özet
    await page.getByRole("button", { name: "Yolculuğu tamamla" }).click();
    await page.getByRole("button", { name: "Evet, tamamla" }).click();
    await expect(page).toHaveURL(/\/yolculuklar\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: `${PREFIX} Tarihi Yarımada` })).toBeVisible();
    const total = await km(page, "sum-distance");
    expect(total).toBeGreaterThan(0.8); // 20 + 20 + 5 adım ≈ 45 × 22 m ≈ 1 km (duraklatmadaki 5 adım hariç)
    expect(total).toBeLessThan(1.3);
    await expect(page.getByTestId("sum-elapsed")).toHaveText(/\d+ dk/);
    await expect(page.getByTestId("summary-points")).toContainText("konum noktası");
    await expect(page.getByTestId("sum-avg")).toHaveText(/km\/sa|—/);
    await page.screenshot({ path: "test-results/screens/yolculuk-ozeti.png" });

    // Listede "Tamamlanan yolculuklar"
    await page.getByRole("link", { name: "Yolculuklarım" }).first().click();
    await expect(page.getByTestId("completed-card").filter({ hasText: `${PREFIX} Tarihi Yarımada` })).toBeVisible();
    await page.getByTestId("completed-card").filter({ hasText: `${PREFIX} Tarihi Yarımada` }).click();

    // Ham noktaları sil (özet kalır) → yolculuğu sil
    await page.getByRole("button", { name: "Ham GPS noktalarını sil" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Ham GPS noktalarını sil" }).click();
    await expect(page.getByTestId("summary-points")).toContainText("Ham GPS noktaları silinmiş", { timeout: 15_000 });
    expect(await km(page, "sum-distance")).toBe(total);

    await page.getByRole("button", { name: "Yolculuğu sil" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yolculuğu sil" }).click();
    await expect(page).toHaveURL(/\/yolculuklar$/);
    await expect(page.getByTestId("completed-card").filter({ hasText: PREFIX })).toHaveCount(0);
  });

  test("planlı yolculuğu başlatma ve iptal: plan yeniden 'Planlandı' olur, iz kalmaz", async ({ page, context }) => {
    test.setTimeout(90_000);
    const sb = await alice();
    const { data: plan, error } = await sb.rpc("save_trip_plan", {
      p_trip_id: null, p_expected_version: null, p_title: `${PREFIX} Planlı`, p_description: null, p_planned_date: null,
      p_stops: [{ name: "Sultanahmet", lat: 41.0055, lng: 28.9768 }, { name: "Karaköy", lat: 41.0228, lng: 28.9744 }], p_route: null,
    } as never).single<{ trip_id: string }>();
    expect(error).toBeNull();

    await login(page, "alice", `/kayit-modu?yolculuk=${plan!.trip_id}`);
    await expect(page.getByLabel("Hangi yolculuk?")).toHaveValue(plan!.trip_id);
    await page.getByRole("button", { name: "Kaydı Başlat" }).click();
    await expect(page.getByTestId("rec-status")).toHaveText("Kaydediliyor");
    await drive(context, START, 3);
    await expect(page.getByTestId("rec-sync")).toHaveText("Tüm veriler kaydedildi", { timeout: 30_000 });

    // Süren kayıt listede uyarı olarak görünür; plan düzenlenemez (kayıt ekranına yönlenir)
    await page.goto("/yolculuklar");
    await expect(page.getByTestId("active-recording-banner")).toContainText(`${PREFIX} Planlı`);
    await page.goto(`/planla/${plan!.trip_id}`);
    await expect(page).toHaveURL(/\/kayit-modu$/);

    await page.getByRole("button", { name: "Kaydı iptal et" }).click();
    await page.getByRole("button", { name: "Evet, iptal et" }).click();
    await expect(page.getByTestId("recorder-idle")).toBeVisible();
    await expect.poll(async () => (await sb.from("trips").select("status").eq("id", plan!.trip_id).single()).data?.status, { timeout: 20_000 }).toBe("planned");
    expect((await sb.from("trip_recordings").select("id").eq("trip_id", plan!.trip_id)).data).toEqual([]);
  });

  test("senkron API: oturumsuz 401, geçersiz istek 400 (Türkçe)", async ({ page, request }) => {
    const anon = await request.post("/api/recordings/sync", { data: { recordingId: "x", ops: [] } });
    expect(anon.status()).toBe(401);
    await login(page, "alice");
    const bad = await page.request.post("/api/recordings/sync", { data: { recordingId: "x", ops: [] } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.message).toMatch(/[ğüşıöçĞÜŞİÖÇ]|geçersiz/i);
  });
});

test.describe("GPS izni", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test("izin verilmezse kayıt açılmaz ve nasıl açılacağı anlatılır", async ({ browser }) => {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    // Konum isteği reddedilmiş tarayıcıyı taklit et (başsız tarayıcıda izin penceresi gösterilemez)
    await page.addInitScript(() => {
      const deny = (_ok: unknown, err?: (e: GeolocationPositionError) => void) =>
        err?.({ code: 1, message: "denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      Object.defineProperty(navigator, "geolocation", {
        value: { getCurrentPosition: deny, watchPosition: (a: unknown, b?: (e: GeolocationPositionError) => void) => (deny(a, b), 1), clearWatch: () => {} },
      });
    });
    await login(page, "alice", "/kayit-modu");
    await page.getByRole("button", { name: "Kaydı Başlat" }).click();
    await expect(page.getByRole("alert")).toContainText("Konum izni reddedildi");
    await expect(page.getByTestId("recorder-idle")).toBeVisible();
    await context.close();
  });
});
