import { describe, expect, it } from "vitest";
import { isSameOriginRequest, readJsonBody } from "./request-guard";

const req = (headers: Record<string, string>, body?: string, url = "https://rovia.app/api/maps/route") =>
  new Request(url, { method: "POST", headers, body });

describe("isSameOriginRequest (CSRF)", () => {
  it("Sec-Fetch-Site: yalnızca same-origin kabul", () => {
    expect(isSameOriginRequest(req({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "none" }))).toBe(false);
    expect(isSameOriginRequest(req({ "sec-fetch-site": "none" }), { allowNavigation: true })).toBe(true);
  });

  it("Sec-Fetch-Site same-origin, sahte Origin ile birleşse bile tarayıcı başlığı esas alınır", () => {
    expect(isSameOriginRequest(req({ "sec-fetch-site": "cross-site", origin: "https://rovia.app" }))).toBe(false);
  });

  it("Origin başlığı: host ile karşılaştırılır", () => {
    expect(isSameOriginRequest(req({ origin: "https://rovia.app", host: "rovia.app" }))).toBe(true);
    expect(isSameOriginRequest(req({ origin: "https://evil.example", host: "rovia.app" }))).toBe(false);
    expect(isSameOriginRequest(req({ origin: "https://rovia.app.evil.example", host: "rovia.app" }))).toBe(false);
    expect(isSameOriginRequest(req({ origin: "http://rovia.app", host: "rovia.app" }))).toBe(false);
    expect(isSameOriginRequest(req({ origin: "null", host: "rovia.app" }))).toBe(false);
  });

  it("Vercel arkasında X-Forwarded-Host/Proto esas alınır", () => {
    const r = req({ origin: "https://rovia.app", "x-forwarded-host": "rovia.app", "x-forwarded-proto": "https" }, undefined, "http://localhost:3000/api/x");
    expect(isSameOriginRequest(r)).toBe(true);
  });

  it("tarayıcı dışı istemci (Origin yok) — kimlik doğrulama ayrıca yapılır", () => {
    expect(isSameOriginRequest(req({}))).toBe(true);
  });
});

describe("readJsonBody", () => {
  it("geçerli JSON", async () => {
    expect(await readJsonBody(req({}, '{"a":1}'), 100)).toEqual({ ok: true, data: { a: 1 } });
  });
  it("bozuk JSON / boş gövde → invalid_json", async () => {
    expect(await readJsonBody(req({}, "{a:"), 100)).toEqual({ ok: false, reason: "invalid_json" });
    expect(await readJsonBody(new Request("https://x/", { method: "POST" }), 100)).toEqual({ ok: false, reason: "invalid_json" });
  });
  it("sınırı aşan gövde → too_large (Content-Length yalan söylese bile)", async () => {
    const big = JSON.stringify({ s: "x".repeat(500) });
    expect(await readJsonBody(req({}, big), 100)).toEqual({ ok: false, reason: "too_large" });
    expect(await readJsonBody(req({ "content-length": "999999" }, "{}"), 100)).toEqual({ ok: false, reason: "too_large" });
  });
  it("geçersiz UTF-8 reddedilir", async () => {
    const r = new Request("https://x/", { method: "POST", body: new Uint8Array([0x22, 0xff, 0x22]) });
    expect(await readJsonBody(r, 100)).toEqual({ ok: false, reason: "invalid_json" });
  });
});
