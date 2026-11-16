import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E jr";
const PHOTO = path.join(__dirname, "fixtures", "kapadokya.jpg");

async function client(who: keyof typeof users) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users[who]);
  if (error) throw error;
  return sb;
}

/** Test yolculuklarını notları ve fotoğraflarıyla (Storage dosyaları dahil) siler. */
async function cleanup() {
  if (!url || !key) return;
  const sb = await client("alice").catch(() => null);
  if (!sb) return;
  const { data: trips } = await sb.from("trips").select("id").like("title", `${PREFIX}%`);
  for (const tr of trips ?? []) {
    const { data: paths } = await sb.rpc("trip_delete", { p_id: tr.id, p_with_journal: true });
    if (paths?.length) await sb.storage.from("media").remove(paths as string[]);
  }
  await sb.from("journal_notes").delete().like("title", `${PREFIX}%`);
}

/** Senkron API ile tamamlanmış bir yolculuk oluşturur (Ankara → Kırıkkale yönü, 20 nokta). */
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

test.describe("Yolculuk arşivi ve seyahat günlüğü (PHASE 6)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("arşiv → yolculuk düzenleme → fotoğraf yükleme (EXIF) → not → Seyahat Günlüğüm → günlükle birlikte silme", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "alice");
    const tripId = await createCompletedTrip(page, `${PREFIX} Ankara turu`);
    const shortTripId = await createCompletedTrip(page, `${PREFIX} Ankara kısa tur`);

    // Arşiv: rota önizlemesi, sıralama ve arama
    await page.goto("/yolculuklar");
    const list = page.getByTestId("completed-list");
    const card = list.getByTestId("completed-card").filter({ hasText: `${PREFIX} Ankara turu` });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator("svg path").first()).toHaveAttribute("d", /^M/);
    await page.getByRole("searchbox", { name: "Yolculuklarda ara" }).fill(PREFIX);
    await expect(list.getByTestId("completed-card")).toHaveCount(2);
    await page.getByTestId("archive-sort").selectOption("name");
    await expect(list.getByTestId("completed-card").first()).toContainText(`${PREFIX} Ankara kısa tur`);
    await page.getByTestId("archive-sort").selectOption("date_asc");
    await expect(list.getByTestId("completed-card").first()).toContainText(`${PREFIX} Ankara turu`);

    // Yolculuk detayı: ad ve açıklama
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/yolculuklar/${tripId}$`));
    await page.getByRole("button", { name: "Adı ve açıklamayı düzenle" }).click();
    await page.getByLabel("Yolculuk adı").fill(`${PREFIX} Ankara turu (güz)`);
    await page.getByLabel("Açıklama").fill("Ekim sabahı kısa bir sürüş.");
    await page.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("trip-title")).toHaveText(`${PREFIX} Ankara turu (güz)`);
    await expect(page.getByTestId("trip-description")).toHaveText("Ekim sabahı kısa bir sürüş.");

    // Fotoğraf yükle: cihazda küçültülür, EXIF tarihi ve konumu okunur, harita işareti çıkar
    const journal = page.getByTestId("trip-journal");
    await journal.getByRole("tab", { name: /Fotoğraflar/ }).click();
    await journal.getByTestId("photo-input").setInputFiles(PHOTO);
    await expect(journal.locator('[data-testid="upload-list"] li[data-status="done"]')).toHaveCount(1, { timeout: 60_000 });
    await expect(journal.getByTestId("photo-grid").locator("img")).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId("pin-photo")).toHaveCount(1);

    // Sunucudaki dosya küçültülmüş ve meta verisi silinmiş olmalı
    const sb = await client("alice");
    const { data: media } = await sb.from("media_assets").select("id, storage_path, thumb_path, width, height, mime_type, latitude, longitude, taken_at").eq("trip_id", tripId);
    expect(media).toHaveLength(1);
    const m = media![0];
    expect(m).toMatchObject({ width: 2560, height: 1707, latitude: 38.6431 });
    expect(m.longitude).toBeCloseTo(34.8289, 4);
    expect(m.taken_at).not.toBeNull();
    const { data: file } = await sb.storage.from("media").download(m.storage_path);
    const bytes = new Uint8Array(await file!.arrayBuffer());
    const text = Buffer.from(bytes).toString("latin1");
    expect(text.includes("Exif")).toBe(false);
    expect(text.includes("ROVIA test camera")).toBe(false);
    expect(text.slice(0, 4)).toBe("RIFF"); // WebP olarak yeniden kodlandı
    expect(m.mime_type).toBe("image/webp");

    // Başka kullanıcı dosyayı okuyamaz
    const bob = await client("bob");
    const { error: bobRead } = await bob.storage.from("media").download(m.storage_path);
    expect(bobRead).not.toBeNull();
    const { data: bobSigned } = await bob.storage.from("media").createSignedUrl(m.storage_path, 60);
    expect(bobSigned?.signedUrl ?? null).toBeNull();

    // Tam ekran görüntüleyici: çekim zamanı, konum, açıklama
    await journal.getByTestId("photo-grid").getByRole("button").first().click();
    const lightbox = page.getByTestId("lightbox");
    await expect(lightbox).toContainText("Çekim:");
    await expect(lightbox).toContainText("38.6431, 34.8289");
    await lightbox.getByLabel("Açıklama").fill("Balonlar havalanırken");
    await lightbox.getByRole("button", { name: "Açıklamayı kaydet" }).click();
    await expect(lightbox.getByRole("status")).toHaveText("Kaydedildi.");
    await page.screenshot({ path: "test-results/screens/gunluk-fotograf.png" });
    await lightbox.getByRole("button", { name: "Kapat" }).click();

    // Not: ziyaret edilen yer + fotoğraf
    await journal.getByRole("tab", { name: /Zaman çizelgesi/ }).click();
    await journal.getByRole("button", { name: "Not ekle" }).click();
    const editor = page.getByTestId("note-editor");
    await editor.getByText("Ziyaret edilen yer", { exact: true }).click();
    await editor.getByLabel("Başlık").fill(`${PREFIX} Anıtkabir ziyareti`);
    await editor.locator("#note-body").fill("Sabah erken, kalabalık yoktu.");
    await editor.getByTestId("note-photo-choices").getByRole("button").first().click();
    await expect(editor).toContainText("1 fotoğraf seçili");
    await editor.getByRole("button", { name: "Kaydet" }).click();
    const note = journal.getByTestId("journal-note").filter({ hasText: `${PREFIX} Anıtkabir ziyareti` });
    await expect(note).toBeVisible({ timeout: 20_000 });
    await expect(note).toContainText("Ziyaret edilen yer");
    await expect(note.getByTestId("photo-grid").locator("img")).toHaveCount(1);

    // Düzenleme
    await note.getByRole("button", { name: "Düzenle" }).click();
    await page.getByTestId("note-editor").locator("#note-body").fill("Sabah erken, kalabalık yoktu. Müzeyi de gezdik.");
    await page.getByTestId("note-editor").getByRole("button", { name: "Kaydet" }).click();
    await expect(journal.getByTestId("journal-note").filter({ hasText: "Müzeyi de gezdik." })).toBeVisible({ timeout: 20_000 });

    // Arşiv kartı sayıları
    await page.goto("/yolculuklar");
    const updated = page.getByTestId("completed-card").filter({ hasText: `${PREFIX} Ankara turu (güz)` });
    await expect(updated).toContainText("1 fotoğraf");
    await expect(updated).toContainText("1 not");
    await expect(updated.locator("img")).toHaveCount(1);

    // Seyahat Günlüğüm: not yolculuk adıyla; süzme; galeri; yeni anı
    await page.goto("/gunluk");
    await expect(page.getByRole("heading", { level: 1, name: "Seyahat Günlüğüm" })).toBeVisible();
    const jNote = page.getByTestId("journal-note").filter({ hasText: `${PREFIX} Anıtkabir ziyareti` });
    await expect(jNote).toBeVisible();
    await expect(jNote.getByRole("link", { name: /Ankara turu \(güz\)/ })).toBeVisible();
    await page.getByTestId("journal-trip-filter").selectOption(shortTripId);
    await expect(page.getByTestId("journal-empty")).toBeVisible();
    await page.getByTestId("journal-trip-filter").selectOption(tripId);
    await page.getByRole("button", { name: "Not ekle" }).click();
    const ed = page.getByTestId("note-editor");
    await expect(ed.getByLabel("Yolculuk")).toHaveValue(tripId);
    await ed.getByText("Anı", { exact: true }).click();
    await ed.getByLabel("Başlık").fill(`${PREFIX} Yolda çay molası`);
    await ed.getByRole("button", { name: "Kaydet" }).click();
    await expect(page.getByTestId("journal-note").filter({ hasText: `${PREFIX} Yolda çay molası` })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("tab", { name: /Fotoğraflar/ }).click();
    await expect(page.getByTestId("photo-grid").locator("img")).toHaveCount(1);
    await page.screenshot({ path: "test-results/screens/gunluk.png" });

    // Notu sil (fotoğraf galeride kalır)
    await page.getByRole("tab", { name: /Zaman çizelgesi/ }).click();
    const tea = page.getByTestId("journal-note").filter({ hasText: `${PREFIX} Yolda çay molası` });
    await tea.getByRole("button", { name: "Sil" }).click();
    await tea.getByRole("button", { name: "Evet, sil" }).click();
    await expect(page.getByText("Not silindi.")).toBeVisible();

    // Yolculuğu günlüğüyle birlikte sil: notlar, kayıtlar ve Storage dosyaları gider
    await page.goto(`/yolculuklar/${tripId}`);
    await page.getByRole("button", { name: "Yolculuğu sil" }).click();
    await page.getByLabel("Bu yolculuğun notlarını ve fotoğraflarını da sil").check();
    await page.getByRole("alertdialog").getByRole("button", { name: "Yolculuğu sil" }).click();
    await expect(page).toHaveURL(/\/yolculuklar$/);
    await expect.poll(async () => (await sb.from("media_assets").select("id").eq("id", m.id)).data?.length).toBe(0);
    const folder = m.storage_path.split("/")[0];
    const { data: files } = await sb.storage.from("media").list(folder, { search: m.storage_path.split("/")[1].replace(/\.\w+$/, "") });
    expect(files ?? []).toEqual([]);
    const { data: left } = await sb.from("journal_notes").select("id").like("title", `${PREFIX} Anıtkabir%`);
    expect(left).toEqual([]);
  });
});
