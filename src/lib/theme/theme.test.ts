import { describe, expect, it } from "vitest";
import { DARK_ONLY_THEME_COLOR, parseThemeCookie, resolveTheme, THEME_COLOR, THEME_SCRIPT, themeCookieString } from "./theme";

/** Betiği sahte bir belge üzerinde çalıştırır. */
function runScript({ cookie, prefersDark = false, pathname = "/panel" }: { cookie: string; prefersDark?: boolean; pathname?: string }) {
  const attrs: Record<string, string> = {};
  const meta = { content: "", setAttribute(_: string, v: string) { this.content = v; } };
  const document = {
    cookie,
    documentElement: { setAttribute: (k: string, v: string) => { attrs[k] = v; } },
    querySelector: () => meta,
  };
  const matchMedia = () => ({ matches: prefersDark });
  new Function("document", "matchMedia", "location", THEME_SCRIPT)(document, matchMedia, { pathname });
  return { theme: attrs["data-theme"], pref: attrs["data-theme-pref"], color: meta.content };
}

describe("tema", () => {
  it("çerez çözümlenir; bilinmeyen değer varsayılana (koyu) düşer", () => {
    expect(parseThemeCookie("a=1; rovia-theme=light; b=2")).toBe("light");
    expect(parseThemeCookie("rovia-theme=system")).toBe("system");
    expect(parseThemeCookie("rovia-theme=pink")).toBe("dark");
    expect(parseThemeCookie("xrovia-theme=light")).toBe("dark");
    expect(parseThemeCookie(undefined)).toBe("dark");
  });

  it("sistem tercihi cihaz moduna göre çözülür", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("çerez 1 yıl, SameSite=Lax; HTTPS'te Secure", () => {
    expect(themeCookieString("light", true)).toBe("rovia-theme=light; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    expect(themeCookieString("dark", false)).not.toContain("Secure");
  });

  it("ilk boyama betiği data-theme ve theme-color ayarlar", () => {
    expect(runScript({ cookie: "" })).toEqual({ theme: "dark", pref: "dark", color: THEME_COLOR.dark });
    expect(runScript({ cookie: "rovia-theme=light" })).toEqual({ theme: "light", pref: "light", color: THEME_COLOR.light });
    expect(runScript({ cookie: "rovia-theme=system", prefersDark: false })).toMatchObject({ theme: "light", pref: "system" });
    expect(runScript({ cookie: "rovia-theme=system", prefersDark: true })).toMatchObject({ theme: "dark" });
    expect(runScript({ cookie: "rovia-theme=<script>" })).toMatchObject({ theme: "dark", pref: "dark" });
    // Ana sayfa her zaman koyu: yalnızca arayüz rengi
    expect(runScript({ cookie: "rovia-theme=light", pathname: "/" })).toEqual({ theme: "light", pref: "light", color: DARK_ONLY_THEME_COLOR });
  });
});
