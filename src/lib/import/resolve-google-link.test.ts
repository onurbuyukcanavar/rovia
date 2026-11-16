import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveGoogleMapsLink } from "./resolve-google-link";

function mockRedirects(map: Record<string, string | null>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string, init: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init.redirect).toBe("manual");
    const location = map[url];
    if (location === undefined) throw new Error(`beklenmeyen istek: ${url}`);
    return new Response(null, location ? { status: 302, headers: { location } } : { status: 200 });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveGoogleMapsLink", () => {
  it("kısa bağlantıyı tam yer adresine çözer (yalnızca yönlendirme başlıkları)", async () => {
    const calls = mockRedirects({
      "https://maps.app.goo.gl/AbC123": "https://www.google.com/maps/place/Uzung%C3%B6l/@40.6,40.2,15z/data=!3d40.6195!4d40.2895",
    });
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/AbC123")).resolves.toContain("!3d40.6195!4d40.2895");
    expect(calls).toEqual(["https://maps.app.goo.gl/AbC123"]);
  });

  it("AB çerez onay sayfasında hedefi 'continue' parametresinden alır (onay sayfasına istek atmaz)", async () => {
    const target = "https://www.google.com/maps/place/Galata+Kulesi/data=!4m2!3m1!1s0x1:0x2";
    const calls = mockRedirects({
      "https://maps.app.goo.gl/Xyz": `https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=TR`,
    });
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/Xyz")).resolves.toBe(target);
    expect(calls).toHaveLength(1);
  });

  it("koordinatlı tam bağlantıda ağ isteği yapılmaz", async () => {
    const calls = mockRedirects({});
    await expect(resolveGoogleMapsLink("https://www.google.com/maps?q=41.0,29.0")).resolves.toContain("q=41.0,29.0");
    expect(calls).toEqual([]);
  });

  it("Google Maps dışı adresler ve dışarıya yönlendirmeler reddedilir (SSRF)", async () => {
    mockRedirects({ "https://maps.app.goo.gl/evil": "http://169.254.169.254/latest/meta-data" });
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/evil")).rejects.toThrow("invalid_link");
    await expect(resolveGoogleMapsLink("https://example.com/maps/place/x")).rejects.toThrow("invalid_link");
    await expect(resolveGoogleMapsLink("javascript:alert(1)")).rejects.toThrow("invalid_link");
    await expect(resolveGoogleMapsLink("not a url")).rejects.toThrow("invalid_link");
  });

  it("sonsuz yönlendirme döngüsü sınırlıdır", async () => {
    mockRedirects({
      "https://maps.app.goo.gl/a": "https://maps.app.goo.gl/b",
      "https://maps.app.goo.gl/b": "https://maps.app.goo.gl/a",
    });
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/a")).resolves.toMatch(/maps\.app\.goo\.gl/);
  });
});
