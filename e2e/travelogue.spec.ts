import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { bottomGapReport, hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E tl";

/** Testin oluşturduğu seyahatnameleri (bölüm ve yazılarıyla) siler. */
async function cleanup() {
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) return;
  // Yazılara yüklenen test fotoğrafları (seyahatname silinince fotoğraflar kalır; testte temizlenir)
  const { data: tvs } = await sb.from("travelogues").select("id").like("title", `${PREFIX}%`);
  const tvIds = (tvs ?? []).map((v) => v.id);
  if (tvIds.length) {
    const { data: links } = await sb.from("travelogue_entry_media").select("media_id, travelogue_entries!inner(travelogue_id)")
      .in("travelogue_entries.travelogue_id", tvIds);
    const ids = [...new Set((links ?? []).map((l) => l.media_id))];
    if (ids.length) {
      const { data: paths } = await sb.rpc("media_delete", { p_ids: ids });
      if (paths?.length) await sb.storage.from("media").remove(paths as string[]);
    }
  }
  await sb.from("travelogues").delete().like("title", `${PREFIX}%`);
}

test.describe("ROVIA Journal — seyahatname (PHASE 7)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test.describe.configure({ mode: "serial" });
  test.beforeAll(cleanup);
  test.afterAll(cleanup);

  test("oluştur → kapak → özel bölüm → yazı (kalın metin, etiket) → yeniden yükle → oku → sil", async ({ page }) => {
    test.setTimeout(180_000);
    const stamp = Date.now().toString(36);
    const title = `${PREFIX} Kapadokya ${stamp}`;
    const renamed = `${PREFIX} Kapadokya Günlüğü ${stamp}`;
    const entryTitle = `Göreme ${stamp}`;
    page.on("console", (m) => { if (m.type() === "error") console.log("[tarayıcı hatası]", m.text()); });
    page.on("pageerror", (e) => console.log("[sayfa hatası]", e.message));
    await login(page, "alice");

    // Yolculuksuz yeni seyahatname
    await page.goto("/seyahatnameler");
    await page.getByTestId("new-travelogue").first().click();
    const dialog = page.getByTestId("new-travelogue-dialog");
    await dialog.getByTestId("new-travelogue-no-trip").check();
    await dialog.getByTestId("new-travelogue-title").fill(title);
    await dialog.getByTestId("new-travelogue-submit").click();
    await expect(page).toHaveURL(/\/seyahatnameler\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const workspaceUrl = page.url();
    const workspace = page.getByTestId("travelogue-workspace");
    await expect(workspace).toHaveAttribute("data-ready", "true");
    await expect(workspace.getByTestId("workspace-title")).toHaveText(title);

    // Kapak: başlığı değiştir → otomatik kayıt
    const headerStatus = workspace.locator("header").getByTestId("save-status");
    await workspace.getByTestId("tl-title").fill(renamed);
    await expect(headerStatus).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
    await expect(headerStatus).toContainText("Kaydedildi");

    // Özel bölüm ekle ve metin yaz
    const sectionName = `Yol notları ${stamp}`;
    await workspace.getByTestId("section-add-input").fill(sectionName);
    await workspace.getByTestId("section-add").click();
    const custom = workspace.getByTestId("section-row").filter({ hasText: sectionName });
    await expect(custom).toBeVisible({ timeout: 15_000 });
    await custom.getByTestId("section-edit").click();
    const sectionEditor = custom.getByTestId("section-editor-custom");
    await sectionEditor.click();
    await page.keyboard.type("Yolda gördüklerimiz.");
    await expect(custom.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });

    // Yeni "Keşfedilen yer" yazısı
    await workspace.getByTestId("new-entry").click();
    await page.getByTestId("new-entry-dialog").getByTestId("new-entry-place").click();
    await expect(page).toHaveURL(/\/yazi\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const editor = page.getByTestId("entry-editor");
    await expect(editor).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
    await editor.getByTestId("entry-title").fill(entryTitle);

    // Anlatı: kalın metin
    const narrative = editor.getByTestId("entry-narrative");
    await narrative.click();
    await page.keyboard.type("Peri bacaları ");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("muhteşemdi");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type(".");
    await expect(narrative.locator("strong")).toHaveText("muhteşemdi");

    // Özel etiket
    await editor.getByTestId("entry-custom-tag").fill("balon");
    await editor.getByTestId("entry-custom-tag-add").click();
    await expect(editor.getByTestId("entry-tag").filter({ hasText: "balon" })).toHaveAttribute("aria-pressed", "true");

    // Konum: küçük haritaya tıkla (kitapta harita ve "Keşfedilen noktalar" için)
    await editor.getByTestId("location-map").click();
    // Fotoğraf: yazıya yükle (PDF'te görsel dönüştürmeyi de sınar)
    await editor.getByTestId("entry-photo-upload").click();
    await editor.getByTestId("entry-photos").getByTestId("photo-input").setInputFiles(path.join(__dirname, "fixtures", "kapadokya.jpg"));
    await expect(editor.getByTestId("entry-photo")).toHaveCount(1, { timeout: 30_000 });

    const entryStatus = editor.locator("header").getByTestId("save-status");
    await expect(entryStatus).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
    await expect(entryStatus).toContainText("Kaydedildi");

    // Yeniden yükle: metin, kalın biçim ve etiket korunmuş olmalı
    await page.reload();
    await expect(editor.getByTestId("entry-title")).toHaveValue(entryTitle, { timeout: 20_000 });
    await expect(editor.getByTestId("entry-narrative")).toContainText("Peri bacaları muhteşemdi.");
    await expect(editor.getByTestId("entry-narrative").locator("strong")).toHaveText("muhteşemdi");
    await expect(editor.getByTestId("entry-tag").filter({ hasText: "balon" })).toHaveAttribute("aria-pressed", "true");

    // Çalışma alanına dön: yazı listede
    await editor.getByTestId("entry-back").click();
    await expect(page).toHaveURL(workspaceUrl);
    await expect(workspace.getByTestId("entry-row").filter({ hasText: entryTitle })).toBeVisible();

    // Okuma görünümü: kapak başlığı ve bölüm başlıkları
    await workspace.getByTestId("read-link").click();
    await expect(page).toHaveURL(/\/oku$/);
    const book = page.getByTestId("book-view");
    await expect(book).toBeVisible({ timeout: 20_000 });
    await expect(book).toContainText(renamed);
    await expect(book).toContainText(sectionName);
    await expect(book).toContainText(entryTitle);

    // PDF: tarayıcıda oluşturulur (fotoğraf JPEG'e çevrilir, harita çizilir) ve indirilir
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 90_000 }),
      page.getByTestId("pdf-export").click(),
    ]);
    const file = await download.path();
    const bytes = fs.readFileSync(file);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(50_000);
    console.log("[pdf]", download.suggestedFilename(), bytes.length, "bayt");

    // Sil
    // Liste sayfası (masaüstü): altta boş alan kalmamalı
    await page.goto("/seyahatnameler");
    await expect(page.getByTestId("travelogue-card").first()).toBeVisible({ timeout: 20_000 });
    for (const y of [0, 5000]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(300);
      const gap = await bottomGapReport(page);
      console.log(`[liste boşluk] kaydırma=${y} belge=${gap.doc} içerik=${gap.contentBottom}`, gap.lowest.slice(0, 5));
      expect(gap.doc - Math.max(gap.contentBottom, gap.innerHeight)).toBeLessThan(120);
    }

    await page.goto(workspaceUrl);
    await expect(workspace).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
    await workspace.getByTestId("travelogue-delete").click();
    await workspace.getByTestId("travelogue-delete-confirm").click();
    await expect(page).toHaveURL(/\/seyahatnameler$/, { timeout: 20_000 });
    // Önceki sayfalar gizli tutulabilir (Activity); yalnızca görünen listeye bak
    await expect(page.locator("[data-testid=travelogue-card]:visible").filter({ hasText: renamed })).toHaveCount(0);
  });
});
