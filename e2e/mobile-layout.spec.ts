import { expect, test, type Page } from "@playwright/test";
import { bottomGapReport, hasCredentials, login } from "./helpers";

/** Telefon ekranı: iPhone 13/14 boyutu */
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

const PAGES = ["/panel", "/harita", "/yolculuklar", "/planla", "/kayit-modu", "/favoriler", "/favoriler/ice-aktar", "/kesfet", "/gunluk", "/seyahatnameler", "/ayarlar", "/garaj", "/diger", "/konum", "/konum?text=41.0256%2C28.9741"];

/** Ekran genişliğini aşan en derin öğeler (yatay kaydırmanın kaynağı). */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= w + 1) continue;
      // Kendi içinde kaydırılan kapsayıcıların içi sayılmaz
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (["auto", "scroll", "hidden", "clip"].includes(s.overflowX) && p.getBoundingClientRect().right <= w + 1) { clipped = true; break; }
        p = p.parentElement;
      }
      if (clipped) continue;
      const hasOverflowingChild = Array.from(el.children).some((c) => c.getBoundingClientRect().right > w + 1);
      if (hasOverflowingChild) continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 80)} right=${Math.round(r.right)} text="${(el.textContent ?? "").trim().slice(0, 40)}"`);
    }
    return { clientWidth: w, scrollWidth: document.documentElement.scrollWidth, items: out.slice(0, 12) };
  });
}

test.describe("mobil yerleşim", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  test("büyük yazı boyutunda (Android %130) dar ekranda yatay taşma yok", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 360, height: 760 });
    // Android'in sistem yazı boyutu WebView'da metni büyütür; kök yazı boyutunu büyüterek taklit edilir
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => { document.documentElement.style.fontSize = "130%"; });
    });
    await login(page, "alice");
    const problems: string[] = [];
    for (const path of [...PAGES, "/indir"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(600);
      const rep = await overflowReport(page);
      // html/body overflow-x: clip olduğundan scrollWidth taşmayı göstermez; taşan öğeler tek tek sayılır
      if (rep.items.length) problems.push(`${path}: ekran ${rep.clientWidth}px\n    ${rep.items.join("\n    ")}`);
      await page.screenshot({ path: `test-results/screens/buyuk-yazi${path.replace(/\//g, "_")}.png` });
    }
    console.log("\nSORUNLAR:\n" + problems.join("\n"));
    expect(problems).toEqual([]);
  });

  test("sayfalar ekrana sığar; menüler kaydırmada yerinde kalır", async ({ page }) => {
    test.setTimeout(180_000);
    await login(page, "alice");
    const problems: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);
      const rep = await overflowReport(page);
      console.log(`\n=== ${path} clientWidth=${rep.clientWidth} scrollWidth=${rep.scrollWidth}`);
      for (const i of rep.items) console.log("  taşan:", i);
      if (rep.scrollWidth > rep.clientWidth) problems.push(`${path}: yatay taşma ${rep.scrollWidth}>${rep.clientWidth}`);
      const gap = await bottomGapReport(page);
      console.log(`  alt boşluk: belge=${gap.doc} içerik=${gap.contentBottom}`);
      for (const l of gap.lowest) console.log("  en alt:", l);
      // Alt menü (sabit) payı ~ 4.5rem; bundan fazla boşluk kalmamalı
      if (gap.doc > gap.innerHeight && gap.doc - gap.contentBottom > 140) problems.push(`${path}: altta ${gap.doc - gap.contentBottom}px boşluk`);

      const name = path.replace(/\//g, "_");
      await page.screenshot({ path: `test-results/screens/mobil${name}.png` });

      // Kaydırınca üst çubuk ve alt menü ekranda kalmalı
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      if (docH > 844 + 50) {
        await page.mouse.wheel(0, 2000);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(400);
        const pos = await page.evaluate(() => {
          const top = document.querySelector("header")?.getBoundingClientRect();
          const bottom = document.querySelector('nav[aria-label="Alt menü"]')?.getBoundingClientRect();
          return { scrollY: window.scrollY, headerTop: top?.top ?? null, navBottom: bottom?.bottom ?? null, ih: window.innerHeight };
        });
        console.log(`  kaydırma: ${JSON.stringify(pos)}`);
        if (pos.headerTop !== null && Math.abs(pos.headerTop) > 1) problems.push(`${path}: üst çubuk kaydırmada kayboldu (${pos.headerTop})`);
        if (pos.navBottom !== null && Math.abs(pos.navBottom - pos.ih) > 2) problems.push(`${path}: alt menü yerinde değil (${pos.navBottom}/${pos.ih})`);
        await page.screenshot({ path: `test-results/screens/mobil${name}-kaydirilmis.png` });
      }
    }
    console.log("\nSORUNLAR:\n" + problems.join("\n"));
    expect(problems).toEqual([]);
  });

  test("yazı alanları 16px (iOS yakınlaştırmaz); harita dokununca tam ekran olur, Küçült ve geri ile döner", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "alice", "/favoriler");
    await expect(page.getByRole("searchbox", { name: "Listede ara" })).toBeVisible({ timeout: 20_000 });
    const sizes = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea"))
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16);

    await page.goto("/harita");
    const frame = page.getByTestId("map");
    await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
    const box = (await frame.boundingBox())!;
    expect(box.height).toBeLessThan(500);
    // Boş bir yere dokun → tam ekran
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(frame).toHaveAttribute("data-expanded", "true");
    await expect.poll(async () => Math.round((await frame.boundingBox())?.height ?? 0)).toBe(844);
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/screens/mobil-harita-tam-ekran.png" });
    await page.getByRole("button", { name: "Küçült" }).click();
    await expect(frame).not.toHaveAttribute("data-expanded", "true");
    await expect(page).toHaveURL(/\/harita$/);

    // Telefonun geri hareketi sayfadan çıkmaz, haritayı küçültür
    await page.getByRole("button", { name: "Haritayı tam ekran yap" }).click();
    await expect(frame).toHaveAttribute("data-expanded", "true");
    await page.goBack();
    await expect(frame).not.toHaveAttribute("data-expanded", "true");
    await expect(page).toHaveURL(/\/harita$/);
  });
});

test.describe("mobil ana sayfa (oturumsuz)", () => {
  test("üst menü kaydırmada ekranda kalır; sayfa ekrana sığar", async ({ page }) => {
    await page.goto("/");
    const rep = await overflowReport(page);
    for (const i of rep.items) console.log("  taşan:", i);
    expect(rep.scrollWidth).toBeLessThanOrEqual(rep.clientWidth);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const header = page.locator("header").first();
    await expect(header.getByRole("link", { name: "Giriş yap" })).toBeInViewport();
    expect(Math.round((await header.boundingBox())!.y)).toBe(0);
  });
});
