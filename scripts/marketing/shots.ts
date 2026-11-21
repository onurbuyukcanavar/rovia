/**
 * Canlı siteden (BASE_URL, varsayılan https://www.roviaroad.com) pazarlama ekran görüntüleri ve kısa videolar.
 * Önce seed-demo.ts çalışmış olmalı (marketing-out/seed.json). Demo hesabıyla arayüzden giriş yapılır.
 *
 *   DEMO_PASSWORD=… NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npx tsx scripts/marketing/shots.ts
 *
 * Çıktı: marketing-out/{desktop,mobile}/{dark,light}/NN-ad.png, marketing-out/video/*.webm, marketing-out/index.html.
 * Tek bir sayfa başarısız olursa kaydedilir ve devam edilir; yalnızca giriş başarısız olursa çıkış kodu 1'dir.
 * Oturum durumu (storageState) çıktı klasörüne DEĞİL geçici klasöre yazılır: artefakta token girmez.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { mapColorCount, mapHasColor } from "../../e2e/helpers";
import {
  BASE_URL, DEMO_EMAIL, OUT_DIR, SEED_FILE, demoPassword, log, retry, signIn, sleep, writeJson, type Db, type SeedResult,
} from "./common";

type Theme = "dark" | "light";
type Device = "desktop" | "mobile";

const ROUTE_RGB: Record<Theme, [number, number, number]> = { dark: [0xf0, 0xa9, 0x4a], light: [0xe8, 0x91, 0x2d] };
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const HOST = new URL(BASE_URL).hostname;
const AUTH_STATE = join(tmpdir(), `rovia-marketing-auth-${process.pid}.json`);
const ONLY = (process.env.SHOTS_ONLY ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const results: { name: string; ok: boolean; ms: number; error?: string }[] = [];

/** test.step benzeri: süre + hata kaydı, hata yutulur (devam edilir). */
async function step(name: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  log(`▶ ${name}`);
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
  } catch (e) {
    const error = e instanceof Error ? e.message.split("\n")[0].slice(0, 300) : String(e);
    results.push({ name, ok: false, ms: Date.now() - t0, error });
    log(`  ✗ ${name}: ${error}`);
  }
}

// ----------------------------------------------------------------------------- Tarayıcı
function contextOptions(device: Device, theme: Theme, extra: BrowserContextOptions = {}): BrowserContextOptions {
  const base: BrowserContextOptions = {
    baseURL: BASE_URL,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    colorScheme: theme,
    reducedMotion: "no-preference",
    serviceWorkers: "block",
    permissions: ["geolocation"],
    geolocation: { latitude: 40.9906, longitude: 29.0254, accuracy: 15 },
  };
  const dev: BrowserContextOptions = device === "desktop"
    ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
    : { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA };
  return { ...base, ...dev, ...extra };
}

async function newContext(browser: Browser, device: Device, theme: Theme, opts: { auth: boolean; extra?: BrowserContextOptions }) {
  const ctx = await browser.newContext(contextOptions(device, theme, {
    ...(opts.auth ? { storageState: AUTH_STATE } : {}),
    ...opts.extra,
  }));
  await ctx.addCookies([{ name: "rovia-theme", value: theme, domain: HOST, path: "/", secure: BASE_URL.startsWith("https"), sameSite: "Lax" }]);
  ctx.setDefaultTimeout(30_000);
  ctx.setDefaultNavigationTimeout(60_000);
  return ctx;
}

async function newPage(ctx: BrowserContext) {
  const page = await ctx.newPage();
  // Kaydedilmemiş değişiklik uyarıları vb. otomatik kabul
  page.on("dialog", (d) => void d.accept().catch(() => {}));
  return page;
}

/** Sayfa oturdu mu: ağ sakin, yazı tipleri ve görseller yüklendi, iskeletler kayboldu. */
async function settle(page: Page, extraMs = 800) {
  await page.waitForLoadState("load").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForFunction(
    () => Array.from(document.images).every((i) => i.complete),
    undefined, { timeout: 10_000 },
  ).catch(() => {});
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll(".animate-pulse")).some((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    }),
    undefined, { timeout: 12_000 },
  ).catch(() => {});
  await page.addStyleTag({
    content: "*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}nextjs-portal{display:none!important}",
  }).catch(() => {});
  await sleep(extraMs);
}

/** Harita tuvali çizildi mi (ve isteğe bağlı rota rengi görünüyor mu). Bulunamazsa uyarı, hata değil. */
async function waitMap(page: Page, route?: Theme) {
  const canvas = page.locator(".maplibregl-canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 45_000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 60_000) {
    if ((await mapColorCount(page).catch(() => 0)) > 40) break;
    await sleep(1_000);
  }
  if (route) {
    const t1 = Date.now();
    let seen = false;
    while (Date.now() - t1 < 40_000 && !(seen = await mapHasColor(page, ROUTE_RGB[route]).catch(() => false))) await sleep(1_000);
    if (!seen) log("  ! rota rengi haritada görülemedi (yine de çekiliyor)");
  }
  // Karoların son çözünürlüğü ve etiketler
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await sleep(2_000);
}

function outPath(device: Device, theme: Theme, file: string) {
  const dir = join(OUT_DIR, device, theme);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${file}.png`);
}

async function snap(page: Page, device: Device, theme: Theme, file: string, opts: { fullPage?: boolean; settle?: boolean } = {}) {
  if (opts.settle !== false) await settle(page);
  await page.screenshot({ path: outPath(device, theme, file), fullPage: opts.fullPage ?? false, animations: "disabled", caret: "hide" });
}

async function pick(page: Page, label: string, text: string, option: RegExp, slow = false) {
  const box = page.getByRole("combobox", { name: label });
  await box.click();
  await box.fill("");
  if (slow) await box.pressSequentially(text, { delay: 110 });
  else await box.fill(text);
  const opt = page.getByRole("option", { name: option }).first();
  try {
    await opt.waitFor({ state: "visible", timeout: 20_000 });
    await opt.click();
  } catch {
    await page.getByRole("option").first().click({ timeout: 10_000 });
  }
}

/** Haritayı Keşfet / planlayıcıda İstanbul → Fethiye rotası (Pamukkale ara durak). */
async function buildRoute(page: Page, slow = false) {
  await pick(page, "Başlangıç", "Kadıköy", /Kadıköy/, slow);
  await pick(page, "Varış", "Ölüdeniz", /Ölüdeniz/, slow);
  await page.getByRole("button", { name: "Ara durak ekle" }).click();
  await pick(page, "1. durak", "Pamukkale", /Pamukkale/, slow);
  await page.getByTestId("route-distance").first().filter({ hasText: /\d+\s?km/ }).waitFor({ timeout: 60_000 });
}

// ----------------------------------------------------------------------------- Sayfalar
type Ctx = { page: Page; device: Device; theme: Theme; seed: SeedResult };
type Shot = { file: string; devices?: Device[]; run: (c: Ctx) => Promise<void> };

const simple = (file: string, path: string, opts: { map?: boolean; fullPage?: boolean; devices?: Device[] } = {}): Shot => ({
  file, devices: opts.devices,
  run: async ({ page, device, theme }) => {
    await page.goto(path);
    if (opts.map) await waitMap(page).catch((e) => log(`  ! harita: ${e instanceof Error ? e.message : e}`));
    await snap(page, device, theme, file);
    if (opts.fullPage) await snap(page, device, theme, `${file}-tam`, { fullPage: true, settle: false });
  },
});

function appShots(): Shot[] {
  return [
    simple("03-panel", "/panel", { fullPage: true }),
    {
      file: "04-harita-rota",
      run: async ({ page, device, theme }) => {
        await page.goto("/harita");
        await waitMap(page);
        await retry("rota oluştur", async () => {
          await buildRoute(page);
        }, 2, 3_000);
        await waitMap(page, theme);
        await snap(page, device, theme, "04-harita-rota");
      },
    },
    {
      file: "05-planla",
      run: async ({ page, device, theme, seed }) => {
        if (!seed.plannedTripId) throw new Error("planlı yolculuk yok");
        await page.goto(`/planla/${seed.plannedTripId}`);
        await page.getByTestId("route-distance").first().filter({ hasText: /\d+\s?km/ }).waitFor({ timeout: 60_000 }).catch(() => {});
        await waitMap(page, theme);
        await snap(page, device, theme, "05-planla");
        if (device === "desktop") await snap(page, device, theme, "05-planla-tam", { fullPage: true, settle: false });
      },
    },
    {
      file: "06-kesfet",
      run: async ({ page, device, theme }) => {
        await page.goto("/kesfet?konum=37.9240,29.1250,14&kategori=ancient");
        const list = page.getByTestId("explore-list");
        await list.waitFor({ timeout: 30_000 });
        await waitMap(page);
        await snap(page, device, theme, "06-kesfet-liste");
        const item = list.getByRole("button", { name: /Hierapolis/i }).first();
        try {
          await item.waitFor({ timeout: 25_000 });
          await item.click();
        } catch {
          log("  ! Hierapolis listede yok; ilk yer açılıyor");
          await list.getByRole("button").first().click();
        }
        const panel = page.getByTestId("explore-place");
        await panel.waitFor({ timeout: 20_000 });
        const wiki = page.getByTestId("wiki-info");
        await wiki.waitFor({ timeout: 30_000 }).catch(() => log("  ! Vikipedi bölümü görünmedi"));
        await sleep(1_500);
        await snap(page, device, theme, "06b-kesfet-yer");
        if (await wiki.isVisible().catch(() => false)) {
          await wiki.scrollIntoViewIfNeeded();
          await snap(page, device, theme, "06c-kesfet-vikipedi");
        }
      },
    },
    {
      file: "06d-kesfet-rota",
      run: async ({ page, device, theme, seed }) => {
        if (!seed.plannedTripId) throw new Error("planlı yolculuk yok");
        await page.goto(`/kesfet?yolculuk=${seed.plannedTripId}&kategori=featured`);
        await page.getByTestId("explore-list").waitFor({ timeout: 30_000 }).catch(() => {});
        await waitMap(page, theme);
        await snap(page, device, theme, "06d-kesfet-rota");
      },
    },
    simple("07-yolculuklar", "/yolculuklar", { fullPage: true }),
    {
      file: "08-yolculuk-detay",
      run: async ({ page, device, theme, seed }) => {
        if (!seed.completedTripId) throw new Error("tamamlanan yolculuk yok");
        await page.goto(`/yolculuklar/${seed.completedTripId}`);
        await page.getByTestId("summary-stats").waitFor({ timeout: 30_000 }).catch(() => {});
        await waitMap(page);
        await snap(page, device, theme, "08-yolculuk-detay");
        if (device === "mobile") {
          await page.getByTestId("summary-stats").scrollIntoViewIfNeeded().catch(() => {});
          await snap(page, device, theme, "08b-yolculuk-istatistik");
        }
      },
    },
    simple("09-kayit-modu", "/kayit-modu"),
    simple("10-favoriler", "/favoriler", { map: true }),
    simple("11-gunluk", "/gunluk", { fullPage: true }),
    simple("12-seyahatnameler", "/seyahatnameler"),
    {
      file: "13-seyahatname-editor",
      run: async ({ page, device, theme, seed }) => {
        if (!seed.travelogueId) throw new Error("seyahatname yok");
        await page.goto(`/seyahatnameler/${seed.travelogueId}`);
        await snap(page, device, theme, "13-seyahatname-editor");
        const entry = seed.entryIds[1] ?? seed.entryIds[0];
        if (entry) {
          await page.goto(`/seyahatnameler/${seed.travelogueId}/yazi/${entry}`);
          await page.locator(".ProseMirror").first().waitFor({ timeout: 20_000 }).catch(() => {});
          await snap(page, device, theme, "13b-yazi-editor");
        }
      },
    },
    {
      file: "14-seyahatname-oku",
      run: async ({ page, device, theme, seed }) => {
        if (!seed.travelogueId) throw new Error("seyahatname yok");
        await page.goto(`/seyahatnameler/${seed.travelogueId}/oku`);
        await settle(page);
        if (await page.locator(".maplibregl-canvas").count()) await waitMap(page).catch(() => {});
        await snap(page, device, theme, "14-seyahatname-oku");
        await snap(page, device, theme, "14-seyahatname-oku-tam", { fullPage: true, settle: false });
      },
    },
    simple("15-garaj", "/garaj"),
    {
      file: "16-ayarlar",
      run: async ({ page, device, theme }) => {
        await page.goto("/ayarlar");
        await settle(page);
        const card = page.getByTestId("settings-appearance");
        await card.scrollIntoViewIfNeeded().catch(() => {});
        await page.evaluate(() => {
          const el = document.querySelector('[data-testid="settings-appearance"]');
          if (el) el.scrollIntoView({ block: "center" });
        });
        await snap(page, device, theme, "16-ayarlar");
      },
    },
    simple("17-diger", "/diger", { devices: ["mobile"] }),
    simple("18-indir", "/indir"),
  ];
}

async function landingShots(page: Page, device: Device, theme: Theme) {
  await page.goto("/");
  await page.locator("canvas").first().waitFor({ timeout: 20_000 }).catch(() => log("  ! ana sayfa tuvali yok"));
  await settle(page, 3_000);
  await snap(page, device, theme, "01-landing", { settle: false });
  const chapters = await page.locator("[data-scene-chapter]").count();
  for (let i = 0; i < chapters; i++) {
    await page.evaluate((i) => {
      const el = document.querySelectorAll("[data-scene-chapter]")[i] as HTMLElement;
      const top = el.getBoundingClientRect().top + scrollY;
      scrollTo({ top: top + innerHeight * 0.35, behavior: "instant" as ScrollBehavior });
    }, i);
    await sleep(3_000); // parçacıklar şekil değiştirir
    await snap(page, device, theme, `01${String.fromCharCode(98 + i)}-landing-bolum-${i + 1}`, { settle: false });
  }
  for (const [k, f] of [["son", 0.82], ["alt", 1]] as const) {
    await page.evaluate((f) => scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * f, behavior: "instant" as ScrollBehavior }), f);
    await sleep(2_500);
    await snap(page, device, theme, `01z-landing-${k}`, { settle: false });
  }
}

// ----------------------------------------------------------------------------- Giriş ve tema
async function uiLogin(browser: Browser): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctx = await newContext(browser, "desktop", "dark", { auth: false });
    const page = await newPage(ctx);
    try {
      await page.goto("/giris");
      await page.getByLabel("E-posta").fill(DEMO_EMAIL);
      await page.getByLabel("Şifre", { exact: true }).fill(demoPassword());
      await page.getByRole("button", { name: "Giriş yap" }).click();
      await page.waitForURL(/\/panel(\?|$)/, { timeout: 45_000 });
      await ctx.storageState({ path: AUTH_STATE });
      await ctx.close();
      log("Arayüzden giriş tamam.");
      return true;
    } catch (e) {
      log(`  ! giriş denemesi ${attempt}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
      await ctx.close();
      await sleep(5_000);
    }
  }
  return false;
}

async function setAccountTheme(db: Db, userId: string, theme: Theme) {
  const { error } = await db.from("user_settings").update({ theme }).eq("user_id", userId);
  if (error) log(`  ! hesap teması yazılamadı: ${error.message}`);
}

async function loadSeed(db: Db, userId: string): Promise<SeedResult> {
  if (existsSync(SEED_FILE)) return JSON.parse(readFileSync(SEED_FILE, "utf8")) as SeedResult;
  log("seed.json yok; kimlikler veritabanından okunuyor");
  const trips = (await db.from("trips").select("id, title, status, completed_at").order("completed_at", { ascending: true, nullsFirst: true })).data ?? [];
  const tl = (await db.from("travelogues").select("id").limit(1).maybeSingle()).data;
  const entries = tl ? ((await db.from("travelogue_entries").select("id").eq("travelogue_id", tl.id).order("sort_order")).data ?? []) : [];
  const completed = trips.filter((t) => t.status === "completed");
  return {
    userId,
    plannedTripId: trips.find((t) => t.status === "planned")?.id ?? null,
    completedTripId: completed.find((t) => t.title === "Fethiye hafta sonu")?.id ?? completed[0]?.id ?? null,
    secondTripId: null,
    travelogueId: tl?.id ?? null,
    entryIds: entries.map((e) => e.id),
    createdAt: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------------------- Videolar
async function record(browser: Browser, name: string, fn: (page: Page) => Promise<void>) {
  await step(`video ${name}`, async () => {
    const dir = join(OUT_DIR, "video");
    const tmp = join(OUT_DIR, ".video-tmp");
    mkdirSync(dir, { recursive: true });
    const ctx = await newContext(browser, "desktop", "dark", {
      auth: true,
      extra: { deviceScaleFactor: 1, recordVideo: { dir: tmp, size: { width: 1920, height: 1080 } } },
    });
    const page = await newPage(ctx);
    const video = page.video();
    try {
      await fn(page);
    } finally {
      await ctx.close();
      if (video) {
        await video.saveAs(join(dir, `${name}.webm`));
        await video.delete().catch(() => {});
      }
    }
  });
}

async function smoothScroll(page: Page, total: number, x = 1100, y = 540) {
  await page.mouse.move(x, y);
  const steps = Math.ceil(Math.abs(total) / 30);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, Math.sign(total) * 30);
    await sleep(28);
  }
}

async function videos(browser: Browser, seed: SeedResult) {
  await record(browser, "a-planla-istanbul-fethiye", async (page) => {
    await page.goto("/planla");
    await settle(page, 1_500);
    const title = page.getByLabel("Yolculuk adı");
    await title.click();
    await title.pressSequentially("İstanbul – Fethiye", { delay: 70 });
    await sleep(500);
    await buildRoute(page, true);
    await waitMap(page, "dark");
    await sleep(4_000);
  });
  await record(browser, "b-panel-kaydirma", async (page) => {
    await page.goto("/panel");
    await settle(page, 1_500);
    await smoothScroll(page, 2_400);
    await sleep(1_200);
    await smoothScroll(page, -2_400);
    await sleep(1_000);
  });
  await record(browser, "c-kesfet-vikipedi", async (page) => {
    await page.goto("/kesfet?konum=37.9240,29.1250,14&kategori=ancient");
    const list = page.getByTestId("explore-list");
    await list.waitFor({ timeout: 30_000 });
    await waitMap(page);
    await sleep(1_000);
    const item = list.getByRole("button", { name: /Hierapolis/i }).first();
    const found = await item.waitFor({ timeout: 25_000 }).then(() => true, () => false);
    await (found ? item : list.getByRole("button").first()).click();
    await page.getByTestId("wiki-info").waitFor({ timeout: 30_000 }).catch(() => {});
    await sleep(2_000);
    const box = await page.getByTestId("explore-place").boundingBox();
    if (box) await smoothScroll(page, 900, box.x + box.width / 2, box.y + Math.min(box.height / 2, 500));
    await sleep(3_000);
  });
  await record(browser, "d-tema-degistir", async (page) => {
    await page.goto(seed.completedTripId ? `/yolculuklar/${seed.completedTripId}` : "/panel");
    await settle(page, 1_000);
    if (await page.locator(".maplibregl-canvas").count()) await waitMap(page);
    const toggle = page.getByTestId("theme-toggle").filter({ visible: true }).first();
    await toggle.hover();
    await sleep(800);
    await toggle.click();
    await sleep(3_000);
    await toggle.click();
    await sleep(2_500);
  });
  rmSync(join(OUT_DIR, ".video-tmp"), { recursive: true, force: true });
}

// ----------------------------------------------------------------------------- Temas sayfası
function contactSheet() {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(png|webm)$/.test(f)) files.push(relative(OUT_DIR, p));
    }
  };
  if (existsSync(OUT_DIR)) walk(OUT_DIR);
  const groups = new Map<string, string[]>();
  for (const f of files) {
    const g = f.split("/").slice(0, -1).join(" / ") || ".";
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const failed = results.filter((r) => !r.ok);
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>ROVIA · pazarlama görüntüleri</title>
<style>body{font:14px/1.4 system-ui,sans-serif;background:#0a111d;color:#f7f5f0;margin:0;padding:24px}h1{font-weight:600}h2{margin:32px 0 12px;font-weight:600;color:#f0a94a}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}.m .g{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
figure{margin:0;background:#111a2a;border-radius:10px;overflow:hidden}figure img,figure video{display:block;width:100%;height:auto}figcaption{padding:8px 10px;color:#b6b9bf;font-size:12px;word-break:break-all}
a{color:inherit}.err{color:#ff8a80}</style></head><body>
<h1>ROVIA · pazarlama görüntüleri</h1><p>${esc(BASE_URL)} · ${esc(new Date().toISOString())} · ${files.length} dosya${failed.length ? ` · <span class="err">${failed.length} adım başarısız</span>` : ""}</p>
${failed.length ? `<ul class="err">${failed.map((f) => `<li>${esc(f.name)}: ${esc(f.error ?? "")}</li>`).join("")}</ul>` : ""}
${[...groups].map(([g, list]) => `<section class="${g.startsWith("mobile") ? "m" : ""}"><h2>${esc(g)}</h2><div class="g">${list.map((f) => `<figure><a href="${esc(f)}">${f.endsWith(".webm") ? `<video src="${esc(f)}" controls muted preload="metadata"></video>` : `<img src="${esc(f)}" loading="lazy" alt="">`}</a><figcaption>${esc(f.split("/").pop()!)}</figcaption></figure>`).join("")}</div></section>`).join("\n")}
</body></html>`;
  writeFileSync(join(OUT_DIR, "index.html"), html);
}

// ----------------------------------------------------------------------------- Ana akış
async function main(): Promise<number> {
  demoPassword();
  mkdirSync(OUT_DIR, { recursive: true });
  const auth = await signIn();
  if ("error" in auth) {
    console.error(`::error::Demo hesabıyla giriş yapılamadı: ${auth.error}`);
    return 1;
  }
  const { db, userId } = auth;
  const seed = await loadSeed(db, userId);
  log(`Seed: planlı=${seed.plannedTripId} tamamlanan=${seed.completedTripId} seyahatname=${seed.travelogueId}`);

  const browser = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-webgl"],
  });
  let exitCode = 0;
  try {
    await setAccountTheme(db, userId, "dark");
    if (!(await uiLogin(browser))) {
      console.error("::error::Arayüzden giriş başarısız (/giris).");
      exitCode = 1;
      return exitCode;
    }
    const want = (file: string) => !ONLY.length || ONLY.some((o) => file.startsWith(o));
    for (const theme of ["dark", "light"] as const) {
      await setAccountTheme(db, userId, theme);
      for (const device of ["desktop", "mobile"] as const) {
        // Oturumsuz sayfalar (ana sayfa her zaman koyu: yalnızca koyu geçişte)
        const anon = await newContext(browser, device, theme, { auth: false });
        const ap = await newPage(anon);
        if (theme === "dark" && want("01")) await step(`${device}/${theme} 01-landing`, () => landingShots(ap, device, theme));
        if (want("02")) {
          await step(`${device}/${theme} 02-giris`, async () => {
            await ap.goto("/giris");
            await snap(ap, device, theme, "02-giris");
          });
        }
        await anon.close();

        const ctx = await newContext(browser, device, theme, { auth: true });
        let page = await newPage(ctx);
        for (const s of appShots()) {
          if (s.devices && !s.devices.includes(device)) continue;
          if (!want(s.file)) continue;
          await step(`${device}/${theme} ${s.file}`, async () => {
            if (page.isClosed()) page = await newPage(ctx);
            await s.run({ page, device, theme, seed });
          });
        }
        await ctx.close();
      }
    }
    await setAccountTheme(db, userId, "dark");
    if (!ONLY.length || ONLY.includes("video")) await videos(browser, seed);
  } finally {
    await setAccountTheme(db, userId, "dark");
    await browser.close().catch(() => {});
    rmSync(AUTH_STATE, { force: true });
    contactSheet();
    writeJson(join(OUT_DIR, "report.json"), results);
    const failed = results.filter((r) => !r.ok);
    log(`Bitti: ${results.length - failed.length}/${results.length} adım başarılı.`);
    for (const f of failed) console.log(`::warning::${f.name}: ${f.error}`);
  }
  return exitCode;
}

main().then((code) => process.exit(code), (e) => {
  console.error(e);
  process.exit(1);
});
