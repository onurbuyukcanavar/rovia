import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PREFIX = "E2E tl";

/** Testin oluşturduğu seyahatnameleri (bölüm ve yazılarıyla) siler. */
async function cleanup() {
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  if (error) return;
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

    // Sil
    await page.goto(workspaceUrl);
    await workspace.getByTestId("travelogue-delete").click();
    await workspace.getByTestId("travelogue-delete-confirm").click();
    await expect(page).toHaveURL(/\/seyahatnameler$/, { timeout: 20_000 });
    await expect(page.getByText(renamed)).toHaveCount(0);
  });
});
