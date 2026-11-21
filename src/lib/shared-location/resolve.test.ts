import { describe, expect, it, vi } from "vitest";
import { isAllowedHop, MAX_HOPS, ResolveError, resolveShortLink } from "./resolve";

function mockFetch(map: Record<string, string | null | Error>) {
  const calls: string[] = [];
  const fn = vi.fn(async (input: URL | string | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    const v = map[url];
    if (v === undefined) throw new Error(`beklenmeyen istek: ${url}`);
    if (v instanceof Error) throw v;
    return new Response(null, v ? { status: 302, headers: { location: v } } : { status: 200 });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

describe("resolveShortLink", () => {
  it("maps.app.goo.gl → place + !3d!4d", async () => {
    const m = mockFetch({
      "https://maps.app.goo.gl/AbC123": "https://www.google.com/maps/place/Uzung%C3%B6l/@40.6,40.2,15z/data=!3d40.6195!4d40.2895",
    });
    await expect(resolveShortLink("https://maps.app.goo.gl/AbC123", m.fetch)).resolves.toMatchObject({ kind: "point", lat: 40.6195, lng: 40.2895, label: "Uzungöl" });
    expect(m.calls).toEqual(["https://maps.app.goo.gl/AbC123"]);
  });

  it("çok adımlı zincir ve google.com/url?q= aracı (araca istek atılmaz)", async () => {
    const m = mockFetch({
      "https://goo.gl/maps/xyz": "https://maps.app.goo.gl/next",
      "https://maps.app.goo.gl/next": `https://www.google.com/url?q=${encodeURIComponent("https://maps.google.com/?q=41.1,29.2")}`,
    });
    await expect(resolveShortLink("https://goo.gl/maps/xyz", m.fetch)).resolves.toMatchObject({ kind: "point", lat: 41.1, lng: 29.2 });
    expect(m.calls).toHaveLength(2);
  });

  it("AB çerez onayı: hedef 'continue' parametresinden alınır, onay sayfasına istek atılmaz", async () => {
    const target = "https://www.google.com/maps/place/Galata+Kulesi/data=!4m2!3m1!1s0x1:0x2";
    const m = mockFetch({ "https://maps.app.goo.gl/Xyz": `https://consent.google.com/m?continue=${encodeURIComponent(target)}&gl=TR` });
    await expect(resolveShortLink("https://maps.app.goo.gl/Xyz", m.fetch)).resolves.toEqual({ kind: "query", query: "Galata Kulesi", source: "google" });
    expect(m.calls).toHaveLength(1);
  });

  it("g.co/kgs → google.com/search?q=Ad → sorgu", async () => {
    const m = mockFetch({ "https://g.co/kgs/AbC": "https://www.google.com/search?kgmid=/g/11x&hl=tr&q=Sumela%20Manast%C4%B1r%C4%B1&shndl=30" });
    await expect(resolveShortLink("https://g.co/kgs/AbC", m.fetch)).resolves.toEqual({ kind: "query", query: "Sumela Manastırı", source: "google" });
  });

  it("Yandex kısa bağlantısı (boylam,enlem)", async () => {
    const m = mockFetch({ "https://yandex.com.tr/maps/-/CDq": "https://yandex.com.tr/maps/?ll=28.97%2C41.0&pt=28.9784%2C41.0082&z=16" });
    await expect(resolveShortLink("https://yandex.com.tr/maps/-/CDq", m.fetch)).resolves.toMatchObject({ lat: 41.0082, lng: 28.9784, source: "yandex" });
  });

  it("izinli olmayan hedeflere yönlendirme reddedilir (SSRF)", async () => {
    for (const evil of [
      "http://169.254.169.254/latest/meta-data",
      "https://169.254.169.254/maps",
      "https://evil.example/maps?q=1,2",
      "https://maps.google.com:8443/?q=x",
      "https://user@maps.google.com/?q=x",
      "https://[::1]/maps",
      "https://www.google.com/accounts",
      "file:///etc/passwd",
    ]) {
      const m = mockFetch({ "https://maps.app.goo.gl/evil": evil });
      await expect(resolveShortLink("https://maps.app.goo.gl/evil", m.fetch), evil).rejects.toThrow("invalid_link");
      expect(m.calls).toHaveLength(1);
    }
  });

  it("izinli olmayan başlangıç adresine hiç istek atılmaz", async () => {
    const m = mockFetch({});
    for (const bad of ["https://example.com/x", "javascript:alert(1)", "not a url", "https://goo.gl/other", "http://localhost:3000/maps"]) {
      await expect(resolveShortLink(bad, m.fetch), bad).rejects.toBeInstanceOf(ResolveError);
    }
    expect(m.calls).toEqual([]);
  });

  it("yönlendirme döngüsü en fazla MAX_HOPS istekle sınırlı", async () => {
    const m = mockFetch({
      "https://maps.app.goo.gl/a": "https://maps.app.goo.gl/b",
      "https://maps.app.goo.gl/b": "https://maps.app.goo.gl/a",
    });
    await expect(resolveShortLink("https://maps.app.goo.gl/a", m.fetch)).rejects.toThrow("unresolvable");
    expect(m.calls.length).toBe(MAX_HOPS);
  });

  it("yönlendirme yoksa (200) ve konum çıkmazsa çözülemez; zaman aşımı ayrı kod", async () => {
    const m = mockFetch({ "https://maps.app.goo.gl/dead": null });
    await expect(resolveShortLink("https://maps.app.goo.gl/dead", m.fetch)).rejects.toThrow("unresolvable");
    const timeout = Object.assign(new Error("t"), { name: "TimeoutError" });
    const m2 = mockFetch({ "https://maps.app.goo.gl/slow": timeout });
    await expect(resolveShortLink("https://maps.app.goo.gl/slow", m2.fetch)).rejects.toThrow("timeout");
  });

  it("http kısa bağlantı https'e yükseltilir", async () => {
    const m = mockFetch({ "https://maps.app.goo.gl/h": "https://maps.google.com/?q=40.5,30.5" });
    await expect(resolveShortLink("http://maps.app.goo.gl/h", m.fetch)).resolves.toMatchObject({ lat: 40.5, lng: 30.5 });
  });
});

describe("isAllowedHop", () => {
  it("izin listesi", () => {
    const ok = ["https://maps.app.goo.gl/x", "https://goo.gl/maps/x", "https://g.co/kgs/x", "https://share.google/x", "https://www.google.com/maps/place/x",
      "https://www.google.com.tr/maps/@1,2,3z", "https://maps.google.com/?q=1,2", "https://www.google.com/search?q=x", "https://maps.apple.com/?ll=1,2",
      "https://yandex.com.tr/maps/?ll=1,2"];
    const bad = ["http://maps.google.com/?q=1,2", "https://maps.app.goo.gl.evil.com/x", "https://goo.gl/other", "https://g.co/other",
      "https://www.google.com/accounts", "https://10.0.0.1/maps", "https://evil.com/maps", "https://yandex.com.tr/passport"];
    for (const u of ok) expect(isAllowedHop(new URL(u)), u).toBe(true);
    for (const u of bad) expect(isAllowedHop(new URL(u)), u).toBe(false);
  });
});
