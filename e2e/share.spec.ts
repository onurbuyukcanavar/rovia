import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E sh";
const ORIGIN_NAME = `${PREFIX} Gizli Ev Adresi`;

async function client(who: keyof typeof users) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users[who]);
  if (error) throw error;
  return sb;
}

async function cleanup() {
  if (!url || !key) return;
  const sb = await client("alice").catch(() => null);
  if (!sb) return;
  const { data: trips } = await sb.from("trips").select("id").like("title", `${PREFIX}%`);
  for (const tr of trips ?? []) {
    const { data: paths } = await sb.rpc("trip_delete", { p_id: tr.id, p_with_journal: true });
    if (paths?.length) await sb.storage.from("media").remove(paths as string[]);
  }
}

/** Senkron API ile tamamlanmış (izi kayıtlı) bir yolculuk: Ankara → Kırıkkale yönü, 20 nokta. */
async function createCompletedTrip(page: Page, title: string) {
  const recordingId = randomUUID();
  const segmentId = randomUUID();
  const start = Date.now() - 40 * 60_000;
  const points = Array.from({ length: 20 }, (_, i) => ({
    t: start + 60_000 + i * 60_000, lat: 39.93 + i * 0.004, lng: 32.86 + i * 0.012, acc: 5, spd: 20,
  }));
  const res = await page.request.post("/api/recordings/sync", {
    data: {
      recordingId,
      ops: [
        { type: "start", segmentId, at: start, tripId: null, title },
        { type: "points", segmentId, points },
        { type: "finish", at: start + 22 * 60_000 },
      ],
    },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.status).toBe("completed");
  return body.tripId as string;
}

test.describe("Paylaşım (PHASE 9)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("geçersiz paylaşım bağlantısı oturumsuz da bulunamadı sayfası gösterir (girişe yönlendirmez)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    for (const token of ["0".repeat(64), "abc"]) {
      await page.goto(`/p/${token}`);
      await expect(page).toHaveURL(new RegExp(`/p/${token}$`));
      await expect(page.getByTestId("share-unavailable")).toBeVisible();
      await expect(page.getByText("Bu paylaşım artık kullanılamıyor")).toBeVisible();
    }
    await ctx.close();
  });

  test("yolculuğu bağlantıyla paylaş → oturumsuz görüntüle (başlangıç gizli) → sosyal kart → özele al", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await login(page, "alice");
    const title = `${PREFIX} Kırıkkale yolu`;
    const tripId = await createCompletedTrip(page, title);

    // Duraklar: başlangıç (paylaşılmaz), ara durak (konumu görünür), varış
    const sb = await client("alice");
    const { data: trip } = await sb.from("trips").select("user_id").eq("id", tripId).single();
    const { error: stopsError } = await sb.from("trip_stops").insert([
      { trip_id: tripId, user_id: trip!.user_id, kind: "origin", stop_order: 0, name: ORIGIN_NAME, latitude: 39.93, longitude: 32.86 },
      { trip_id: tripId, user_id: trip!.user_id, kind: "waypoint", stop_order: 1, name: `${PREFIX} Mola`, latitude: 39.97, longitude: 32.98 },
      { trip_id: tripId, user_id: trip!.user_id, kind: "destination", stop_order: 2, name: `${PREFIX} Varış`, latitude: 40.006, longitude: 33.088 },
    ]);
    expect(stopsError).toBeNull();

    // Paylaşım penceresi: bağlantıya sahip olanlar
    await page.goto(`/yolculuklar/${tripId}`);
    await page.getByTestId("share-button").click();
    const dialog = page.getByTestId("share-dialog");
    await expect(dialog.getByTestId("share-form")).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByTestId("share-preview")).toContainText("Şu an hiçbir şey paylaşılmıyor");
    await dialog.getByTestId("share-visibility-link").check();
    await dialog.getByTestId("share-save").click();
    const urlInput = dialog.getByTestId("share-url");
    await expect(urlInput).toHaveValue(/\/p\/[0-9a-f]{64}$/, { timeout: 20_000 });
    await expect(dialog.getByTestId("share-preview")).toContainText("durak");
    await expect(dialog.getByTestId("share-preview")).toContainText("kırpıldı");
    const shareUrl = await urlInput.inputValue();
    const token = shareUrl.split("/p/")[1];

    // Oturumsuz ziyaretçi
    const guest = await browser.newContext();
    const gp = await guest.newPage();
    const response = await gp.goto(`/p/${token}`);
    expect(response?.status()).toBeLessThan(400);
    await expect(gp).toHaveURL(new RegExp(`/p/${token}$`));
    await expect(gp.getByTestId("share-title")).toHaveText(title);
    await expect(gp.getByTestId("share-stops")).toContainText(`${PREFIX} Mola`);
    await expect(gp.locator("body")).not.toContainText(ORIGIN_NAME);
    await expect(gp.getByTestId("share-copy-login")).toHaveAttribute("href", `/giris?next=${encodeURIComponent(`/p/${token}`)}`);
    await expect(gp.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(gp.getByTestId("share-footer")).toContainText("ROVIA ile oluşturuldu");

    // Sosyal kart
    const og = await gp.request.get(`/p/${token}/opengraph-image`);
    expect(og.ok()).toBe(true);
    expect(og.headers()["content-type"]).toContain("image/png");
    const ogMeta = await gp.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(ogMeta).toContain(`/p/${token}/opengraph-image`);

    // Özele al → bağlantı çalışmaz
    await dialog.getByTestId("share-visibility-private").check();
    await dialog.getByTestId("share-save").click();
    await expect(dialog.getByTestId("share-url")).toHaveCount(0, { timeout: 20_000 });
    await expect(dialog.getByTestId("share-preview")).toContainText("Şu an hiçbir şey paylaşılmıyor");
    await gp.reload();
    await expect(gp.getByTestId("share-unavailable")).toBeVisible();
    await guest.close();
  });
});
