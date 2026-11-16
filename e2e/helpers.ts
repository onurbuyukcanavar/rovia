import { expect, type Page } from "@playwright/test";

export const users = {
  alice: { email: process.env.E2E_ALICE_EMAIL ?? "", password: process.env.E2E_ALICE_PASSWORD ?? "" },
  bob: { email: process.env.E2E_BOB_EMAIL ?? "", password: process.env.E2E_BOB_PASSWORD ?? "" },
};

export const hasCredentials = Boolean(
  users.alice.email && users.alice.password && users.bob.email && users.bob.password,
);

export async function login(page: Page, who: keyof typeof users, next?: string) {
  await page.goto(next ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  await page.getByLabel("E-posta").fill(users[who].email);
  await page.getByLabel("Şifre", { exact: true }).fill(users[who].password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL(next ?? /\/panel$/);
}

/**
 * Haritanın gerçekten çizildiğini doğrular: harita alanının ekran görüntüsündeki farklı renk sayısı.
 * Worker yüklenemezse ya da karolar gelmezse alan tek renktir (arka plan); çizilmiş haritada yüzlerce renk olur.
 */
export async function mapColorCount(page: Page, selector = ".maplibregl-canvas") {
  const png = (await page.locator(selector).first().screenshot()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 7) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return colors.size;
  }, png);
}

/** Tarayıcı konsolundaki harita (MapLibre) hatalarını toplar. */
export function collectMapErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error" && /worker|maplibre|\[rovia\] harita|webgl/i.test(text)) errors.push(text.slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  return errors;
}

/** Harita alanında verilen renge (±12) yakın piksel var mı (ör. çizilen rota). */
export async function mapHasColor(page: Page, rgb: [number, number, number], selector = ".maplibregl-canvas") {
  const png = (await page.locator(selector).first().screenshot()).toString("base64");
  return page.evaluate(async ({ b64, rgb }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let hits = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - rgb[0]) <= 12 && Math.abs(d[i + 1] - rgb[1]) <= 12 && Math.abs(d[i + 2] - rgb[2]) <= 12) hits++;
      if (hits > 50) return true;
    }
    return false;
  }, { b64: png, rgb });
}
