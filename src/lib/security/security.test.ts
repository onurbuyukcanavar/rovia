import { describe, expect, it } from "vitest";
import { buildCsp, securityHeaders } from "./headers";
import { isProjectSignedStorageUrl } from "./storage-url";
import { safeNextPath } from "@/lib/routes";
import { isGoogleMapsHost } from "@/lib/import/google-url";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("CSP", () => {
  const csp = buildCsp({ supabaseUrl: "https://abcd.supabase.co", mapStyleUrl: "https://tiles.example.org/styles/x" });

  it("temel kısıtlar", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("betik: dış kaynak ve eval yok (yalnızca WebAssembly)", () => {
    const s = directive(csp, "script-src");
    expect(s).not.toContain("'unsafe-eval'");
    expect(s).not.toMatch(/https?:/);
    expect(s).toContain("'wasm-unsafe-eval'");
  });

  it("Supabase (https+wss) ve harita kaynakları izinli, joker yok", () => {
    const c = directive(csp, "connect-src");
    expect(c).toContain("https://abcd.supabase.co");
    expect(c).toContain("wss://abcd.supabase.co");
    expect(c).toContain("https://tiles.openfreemap.org");
    expect(c).toContain("https://tiles.example.org");
    expect(c).not.toContain("*");
    expect(directive(csp, "img-src")).toContain("https://abcd.supabase.co");
    expect(directive(csp, "img-src")).toContain("https://upload.wikimedia.org");
    expect(directive(csp, "img-src")).not.toMatch(/wikimedia\.org\/|\*\.wikimedia|wikipedia/);
    expect(directive(csp, "connect-src")).not.toContain("wiki");
    expect(directive(csp, "worker-src")).toBe("worker-src 'self' blob:");
  });

  it("Google OAuth form yönlendirme zinciri", () => {
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://abcd.supabase.co https://accounts.google.com");
  });

  it("geliştirmede unsafe-eval, üretimde yok", () => {
    expect(directive(buildCsp({ isDev: true }), "script-src")).toContain("'unsafe-eval'");
    expect(buildCsp({ isDev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("geçersiz yapılandırma URL'leri yok sayılır", () => {
    const c = buildCsp({ supabaseUrl: "javascript:alert(1)", mapStyleUrl: "not a url" });
    expect(c).not.toContain("javascript");
    expect(directive(c, "connect-src")).toContain("https://*.supabase.co");
  });

  it("başlık seti: konum izni korunur, kamera kapalı", () => {
    const h = Object.fromEntries(securityHeaders({}).map((x) => [x.key, x.value]));
    expect(h["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(h["Permissions-Policy"]).toContain("camera=()");
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8}/);
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(h["X-DNS-Prefetch-Control"]).toBe("off");
  });
});

describe("safeNextPath (açık yönlendirme)", () => {
  it.each([
    ["/panel", "/panel"],
    ["/yolculuklar/abc?x=1#y", "/yolculuklar/abc?x=1#y"],
    ["/p/" + "a".repeat(64), "/p/" + "a".repeat(64)],
  ])("site içi yol korunur: %s", (input, out) => expect(safeNextPath(input)).toBe(out));

  it.each([
    "//evil.com", "///evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "http:evil.com",
    "javascript:alert(1)", "data:text/html,x", "evil.com", "/\t/evil.com", "/\n/evil.com", " //evil.com",
    "%2F%2Fevil.com", "/./\\evil.com", "/..//evil.com", "/.//evil.com", "/%2e//evil.com", "", null, undefined,
  ])("reddedilir: %j", (input) => {
    const out = safeNextPath(input as string);
    expect(out).toBe("/panel");
  });

  it("çözümlenen yol hiçbir zaman başka kaynağa işaret etmez", () => {
    for (const raw of ["/%5C%5Cevil.com", "/./\\evil.com", "/..//evil.com", "/%09/evil.com"]) {
      const out = safeNextPath(raw);
      expect(new URL(out, "https://rovia.app").origin, raw).toBe("https://rovia.app");
      expect(out.startsWith("//")).toBe(false);
    }
  });
});

describe("isProjectSignedStorageUrl (SSRF)", () => {
  const base = "https://abcd.supabase.co";
  it("yalnızca proje kökenli imzalı Storage bağlantıları", () => {
    expect(isProjectSignedStorageUrl(`${base}/storage/v1/object/sign/media/u/a.webp?token=x`, base)).toBe(true);
    expect(isProjectSignedStorageUrl(`${base}/storage/v1/render/image/sign/media/a.webp?token=x`, base)).toBe(true);
  });
  it.each([
    "https://evil.supabase.co/storage/v1/object/sign/media/a.webp",
    "https://abcd.supabase.co.evil.com/storage/v1/object/sign/a",
    "https://abcd.supabase.co/rest/v1/profiles",
    "https://abcd.supabase.co/storage/v1/object/public/media/a",
    "http://abcd.supabase.co/storage/v1/object/sign/media/a",
    "https://user:pw@abcd.supabase.co/storage/v1/object/sign/media/a",
    "http://169.254.169.254/latest/meta-data/",
    "file:///etc/passwd",
    "not a url",
  ])("reddedilir: %s", (u) => expect(isProjectSignedStorageUrl(u, base)).toBe(false));
  it("yapılandırma yoksa hiçbir şey indirilmez", () => {
    expect(isProjectSignedStorageUrl(`${base}/storage/v1/object/sign/a`, null)).toBe(false);
  });
});

describe("isGoogleMapsHost (SSRF)", () => {
  it("standart dışı port ve kullanıcı bilgisi reddedilir", () => {
    expect(isGoogleMapsHost(new URL("https://maps.app.goo.gl/abc"))).toBe(true);
    expect(isGoogleMapsHost(new URL("https://maps.app.goo.gl:8443/abc"))).toBe(false);
    expect(isGoogleMapsHost(new URL("https://x:y@maps.app.goo.gl/abc"))).toBe(false);
  });
});
