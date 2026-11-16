import { expect, test, type Page } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

/** Telefon ekranı: iPhone 13/14 boyutu */
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

const PAGES = ["/panel", "/harita", "/yolculuklar", "/planla", "/kayit-modu", "/favoriler", "/favoriler/ice-aktar", "/ayarlar", "/diger"];

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

test.describe("mobil yerleşim tanılama", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

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
});
