import { describe, expect, it } from "vitest";
import { isIosNonSafari, SERVER_STATE, sheetVariant, showHeaderButton, type InstallState } from "./install-store";

const state = (p: Partial<InstallState>): InstallState => ({ ready: true, installed: false, os: "android", canPrompt: false, iosNonSafari: false, ...p });

describe("sheetVariant", () => {
  it("işletim sistemi ve istem durumuna göre doğru yönergeyi seçer", () => {
    expect(sheetVariant("android", true)).toBe("android-prompt");
    expect(sheetVariant("android", false)).toBe("android-menu");
    expect(sheetVariant("ios", true)).toBe("ios");
    expect(sheetVariant("ios", false)).toBe("ios");
    expect(sheetVariant("other", true)).toBe("desktop-prompt");
    expect(sheetVariant("other", false)).toBe("desktop");
  });
});

describe("isIosNonSafari", () => {
  it("Safari'yi ayırt eder", () => {
    const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    expect(isIosNonSafari(safari)).toBe(false);
    expect(isIosNonSafari(safari.replace("Version/18.0", "CriOS/130.0"))).toBe(true);
    expect(isIosNonSafari(`${safari} Instagram 300.0`)).toBe(true);
    expect(isIosNonSafari(safari.replace("Version/18.0", "FxiOS/130.0"))).toBe(true);
  });
});

describe("showHeaderButton", () => {
  it("yalnızca telefonda ve yüklenmemişken görünür", () => {
    expect(showHeaderButton(SERVER_STATE)).toBe(false);
    expect(showHeaderButton(state({}))).toBe(true);
    expect(showHeaderButton(state({ os: "ios" }))).toBe(true);
    expect(showHeaderButton(state({ os: "other" }))).toBe(false);
    expect(showHeaderButton(state({ installed: true }))).toBe(false);
    expect(showHeaderButton(state({ ready: false }))).toBe(false);
  });
});
