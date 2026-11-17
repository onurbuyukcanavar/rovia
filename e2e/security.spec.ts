import { randomUUID } from "node:crypto";
import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

/**
 * Güvenlik: kimlik doğrulama, kullanıcı izolasyonu (sayfa + dışa aktarma), güvenlik başlıkları,
 * açık yönlendirme ve çapraz kaynaklı (CSRF) istek reddi.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const UUID = "00000000-0000-4000-8000-000000000000";
const NOT_FOUND_TEXT = "Bu yol bir yere çıkmıyor.";

const POST_ROUTES = [
  "/api/maps/autocomplete",
  "/api/maps/explore",
  "/api/maps/reverse-geocode",
  "/api/maps/route",
  "/api/maps/search",
  "/api/recordings/sync",
];
const GET_ROUTES = [`/api/trips/${UUID}/export?format=gpx`, `/api/travelogues/${UUID}/export?format=html`];

async function expectSafeJsonError(res: APIResponse, statuses: number[]) {
  expect(statuses, `${res.url()} → ${res.status()}`).toContain(res.status());
  expect(res.headers()["content-type"] ?? "").toContain("application/json");
  const text = await res.text();
  // İç ayrıntı sızmaz: yığın izi, dosya yolu, SQL/PostgREST hatası yok
  expect(text).not.toMatch(/\bat \S+ \(|node_modules|\/src\/|PGRST|SQLSTATE|stack/i);
  const body = JSON.parse(text) as { error?: { message?: string } };
  expect(body.error?.message, "Türkçe, kullanıcıya gösterilebilir mesaj").toBeTruthy();
}

async function clientFor(who: keyof typeof users) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users[who]);
  if (error) throw error;
  return sb;
}

test.describe("API — oturumsuz erişim", () => {
  for (const path of POST_ROUTES) {
    test(`POST ${path} → 401 JSON`, async ({ request }) => {
      const res = await request.post(path, { data: { lat: 39, lng: 32 } });
      await expectSafeJsonError(res, [401]);
    });
  }
  for (const path of GET_ROUTES) {
    test(`GET ${path} → 401 JSON`, async ({ request }) => {
      const res = await request.get(path);
      await expectSafeJsonError(res, [401]);
      expect(res.headers()["cache-control"]).toContain("no-store");
    });
  }
});

test.describe("Güvenlik başlıkları", () => {
  const required = (h: Record<string, string>) => {
    const csp = h["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["permissions-policy"]).toContain("geolocation=(self)");
    expect(h["cross-origin-opener-policy"]).toBeTruthy();
    expect(h["x-powered-by"]).toBeUndefined();
  };

  for (const path of ["/", "/giris", "/gizlilik"]) {
    test(`HTML ${path}`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      required(res.headers());
    });
  }

  test("API yanıtı: başlıklar + no-store", async ({ request }) => {
    const res = await request.post("/api/maps/route", { data: {} });
    required(res.headers());
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("ana sayfa ve giriş sayfasında CSP ihlali yok", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(m.text())) violations.push(m.text().slice(0, 300));
    });
    for (const path of ["/", "/giris", "/kayit"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });
});

test.describe("Açık yönlendirme", () => {
  const evil = ["//evil.example", "/\\evil.example", "https://evil.example", "/./\\evil.example", "/..//evil.example", "javascript:alert(1)"];

  for (const next of evil) {
    test(`/auth/callback?next=${next} site içinde kalır`, async ({ request, baseURL }) => {
      for (const query of [`error=access_denied&next=${encodeURIComponent(next)}`, `code=gecersiz&next=${encodeURIComponent(next)}`]) {
        const res = await request.get(`/auth/callback?${query}`, { maxRedirects: 0 });
        expect(res.status()).toBeGreaterThanOrEqual(300);
        expect(res.status()).toBeLessThan(400);
        const location = new URL(res.headers()["location"] ?? "", baseURL);
        expect(location.origin).toBe(new URL(baseURL!).origin);
      }
    });

    test(`/auth/confirm?next=${next} site içinde kalır`, async ({ request, baseURL }) => {
      const res = await request.get(`/auth/confirm?token_hash=x&type=email&next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      const location = new URL(res.headers()["location"] ?? "", baseURL);
      expect(location.origin).toBe(new URL(baseURL!).origin);
    });
  }

  test("giriş sayfası: zararlı next değeri forma site dışı olarak taşınmaz", async ({ page }) => {
    for (const next of evil) {
      await page.goto(`/giris?next=${encodeURIComponent(next)}`);
      const hidden = page.locator('input[name="next"]');
      const count = await hidden.count();
      for (let i = 0; i < count; i++) {
        const value = (await hidden.nth(i).getAttribute("value")) ?? "";
        expect(value === "" || (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")), value).toBe(true);
      }
    }
  });

  test("girişten sonra zararlı next → aynı kökende kalır", async ({ page, baseURL }) => {
    test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
    await page.goto(`/giris?next=${encodeURIComponent("/./\\evil.example")}`);
    await page.getByLabel("E-posta").fill(users.alice.email);
    await page.getByLabel("Şifre", { exact: true }).fill(users.alice.password);
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await expect(page).toHaveURL(/\/panel$/);
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });
});

test.describe("CSRF — çapraz kaynaklı istekler", () => {
  const crossSite = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

  test("oturumsuz çapraz kaynaklı POST → 403", async ({ request }) => {
    for (const path of POST_ROUTES) {
      const res = await request.post(path, { data: { lat: 39, lng: 32 }, headers: crossSite });
      await expectSafeJsonError(res, [403]);
    }
  });

  test("oturumlu kullanıcının çerezleriyle çapraz kaynaklı POST/GET → 403", async ({ page }) => {
    test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
    await login(page, "alice");
    const res = await page.request.post("/api/maps/reverse-geocode", { data: { lat: 39.92, lng: 32.85 }, headers: crossSite });
    await expectSafeJsonError(res, [403]);
    const sync = await page.request.post("/api/recordings/sync", { data: { recordingId: UUID, ops: [] }, headers: crossSite });
    await expectSafeJsonError(sync, [403]);
    const exp = await page.request.get(`/api/trips/${UUID}/export?format=gpx`, { headers: crossSite });
    await expectSafeJsonError(exp, [403]);
    // Aynı kaynaktan gelen istek kabul edilir (403 değil)
    const same = await page.request.post("/api/maps/reverse-geocode", { data: { lat: 1000, lng: 0 }, headers: { "sec-fetch-site": "same-origin" } });
    expect(same.status()).toBe(400);
  });
});

test.describe("Kullanıcı izolasyonu — sayfalar ve dışa aktarma", () => {
  test.skip(!hasCredentials || !url || !key, "E2E_* secret'ları veya Supabase ortamı tanımlı değil");

  async function expectNotFound(page: Page, path: string, secret: string) {
    const res = await page.goto(path);
    await expect(page.getByText(NOT_FOUND_TEXT)).toBeVisible();
    expect(res?.status() === 404 || res?.status() === 200, `${path} → ${res?.status()}`).toBe(true);
    await expect(page.getByText(secret)).toHaveCount(0);
  }

  test("bob, alice'in yolculuk/seyahatname/yazı sayfalarını açamaz ve dışa aktaramaz", async ({ page }) => {
    const alice = await clientFor("alice");
    const { data: me } = await alice.auth.getUser();
    const uid = me.user!.id;
    const secret = `E2E gizli ${randomUUID().slice(0, 8)}`;

    const planned = await alice.from("trips").insert({ user_id: uid, title: `${secret} plan` }).select("id").single();
    const completed = await alice.from("trips").insert({ user_id: uid, title: `${secret} tamam`, status: "completed" }).select("id").single();
    expect(planned.error).toBeNull();
    expect(completed.error).toBeNull();
    const tv = await alice.from("travelogues").insert({ user_id: uid, title: `${secret} kitap` }).select("id").single();
    expect(tv.error).toBeNull();
    const entry = await alice.from("travelogue_entries").insert({ user_id: uid, travelogue_id: tv.data!.id, title: `${secret} yazı` }).select("id").single();
    expect(entry.error).toBeNull();

    try {
      await login(page, "bob");
      await expectNotFound(page, `/planla/${planned.data!.id}`, secret);
      await expectNotFound(page, `/yolculuklar/${completed.data!.id}`, secret);
      await expectNotFound(page, `/seyahatnameler/${tv.data!.id}`, secret);
      await expectNotFound(page, `/seyahatnameler/${tv.data!.id}/oku`, secret);
      await expectNotFound(page, `/seyahatnameler/${tv.data!.id}/yazi/${entry.data!.id}`, secret);

      for (const path of [
        `/api/trips/${completed.data!.id}/export?format=gpx`,
        `/api/trips/${planned.data!.id}/export?format=kml`,
        `/api/travelogues/${tv.data!.id}/export?format=html`,
        `/api/travelogues/${tv.data!.id}/export?format=gpx`,
      ]) {
        const res = await page.request.get(path, { headers: { "sec-fetch-site": "same-origin" } });
        await expectSafeJsonError(res, [404]);
        expect(await res.text()).not.toContain(secret);
      }
    } finally {
      await alice.from("travelogues").delete().eq("id", tv.data!.id);
      await alice.from("trips").delete().in("id", [planned.data!.id, completed.data!.id]);
    }
  });
});
