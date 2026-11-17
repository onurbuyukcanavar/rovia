import { expect, test, type Page } from "@playwright/test";
import { hasCredentials, login } from "./helpers";

/**
 * Performans dumanı testi: oturum açık kullanıcı için ana sayfaların gezinti zamanlamalarını ve LCP'yi ölçer.
 * Eşikler bilerek cömert (CI makinesi + gerçek Supabase gecikmesi); amaç büyük gerilemeleri yakalamak.
 * Sayılar her koşuda loglanır → eğilim CI loglarından izlenebilir. Paket boyutu bütçesi: scripts/perf-budget.mjs.
 */
const PAGES = [
  { path: "/panel", ready: "main" },
  { path: "/harita", ready: ".maplibregl-canvas" },
  { path: "/seyahatnameler", ready: "main" },
] as const;

const LIMITS = { ttfbMs: 3_000, domContentLoadedMs: 6_000, lcpMs: 8_000, mapReadyMs: 12_000 };

type Metrics = { ttfb: number; domContentLoaded: number; load: number; lcp: number | null; transferKB: number };

async function collect(page: Page): Promise<Metrics> {
  return page.evaluate(
    () =>
      new Promise<Metrics>((resolve) => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const transfer = performance.getEntriesByType("resource")
          .reduce((n, r) => n + ((r as PerformanceResourceTiming).transferSize || 0), nav?.transferSize ?? 0);
        let lcp: number | null = null;
        const done = () =>
          resolve({
            ttfb: Math.round(nav?.responseStart ?? 0),
            domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? 0),
            load: Math.round(nav?.loadEventEnd ?? 0),
            lcp: lcp === null ? null : Math.round(lcp),
            transferKB: Math.round(transfer / 1024),
          });
        try {
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) lcp = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          // LCP desteklenmiyorsa yalnızca gezinti zamanlamaları
        }
        setTimeout(done, 500);
      }),
  );
}

test.describe("Performans (oturum açık)", () => {
  test.skip(!hasCredentials, "E2E test hesabı bilgileri tanımlı değil");

  test("ana sayfalar makul sürede yüklenir", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page, "alice");

    const rows: Record<string, unknown>[] = [];
    for (const p of PAGES) {
      const started = Date.now();
      await page.goto(p.path, { waitUntil: "load" });
      await page.locator(p.ready).first().waitFor({ state: "visible", timeout: LIMITS.mapReadyMs });
      const readyMs = Date.now() - started;
      const m = await collect(page);
      rows.push({ path: p.path, ...m, readyMs });

      expect.soft(m.ttfb, `${p.path} TTFB`).toBeLessThan(LIMITS.ttfbMs);
      expect.soft(m.domContentLoaded, `${p.path} DOMContentLoaded`).toBeLessThan(LIMITS.domContentLoadedMs);
      if (m.lcp !== null) expect.soft(m.lcp, `${p.path} LCP`).toBeLessThan(LIMITS.lcpMs);
      expect.soft(readyMs, `${p.path} hazır`).toBeLessThan(LIMITS.mapReadyMs);
    }
    console.log("[perf] gezinti ölçümleri (ms, KB):");
    console.table(rows);
  });
});
