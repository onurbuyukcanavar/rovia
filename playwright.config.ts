import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3000);
/** Yayındaki siteye karşı çalıştırmak için (ör. https://rovia-seven.vercel.app); verilirse yerel sunucu başlatılmaz. */
const REMOTE = process.env.E2E_BASE_URL;

/**
 * Uçtan uca testler gerçek Supabase projesine karşı çalışır.
 * Test hesaplarının bilgileri ortam değişkenlerinden (CI'da GitHub Secrets) gelir.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Yerel ortamda sistem Chrome'u kullanmak için: E2E_CHROME_PATH=/usr/bin/google-chrome
    launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: REMOTE ? undefined : {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
