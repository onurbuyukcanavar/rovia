import { describe, expect, it } from "vitest";
import { clearLocalRoviaData, DELETE_CONFIRM_PHRASE, isSignInFresh, mapDeleteError, normalizeConfirm, REAUTH_REDIRECT } from "./delete";

describe("normalizeConfirm", () => {
  it("kanonik ifadeyi ve yaygın yazım varyantlarını kabul eder", () => {
    for (const v of ["HESABIMI SİL", "  hesabımı sil ", "HESABIMI   SİL", "HESABIMI SIL"]) expect(normalizeConfirm(v)).toBe(DELETE_CONFIRM_PHRASE);
  });
  it("başka ifadeleri reddeder", () => {
    for (const v of ["", "HESABIMI", "SİL", "HESABİMİ SİL X", "delete"]) expect(normalizeConfirm(v)).toBeNull();
  });
});

describe("isSignInFresh", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  it("13 dakika içindeki girişi taze sayar (veritabanı sınırı 15 dk)", () => {
    expect(isSignInFresh("2026-11-17T11:50:00Z", now)).toBe(true);
    expect(isSignInFresh("2026-11-17T11:46:00Z", now)).toBe(false);
    expect(isSignInFresh(null, now)).toBe(false);
    expect(isSignInFresh("geçersiz", now)).toBe(false);
  });
});

describe("mapDeleteError", () => {
  it("RPC hatalarını kodlara çevirir", () => {
    expect(mapDeleteError("reauth_required")).toBe("reauth_required");
    expect(mapDeleteError("media_remaining")).toBe("media_remaining");
    expect(mapDeleteError("confirmation_required")).toBe("confirm");
    expect(mapDeleteError("boom")).toBe("failed");
  });
});

describe("clearLocalRoviaData", () => {
  it("yalnızca rovia: anahtarlarını siler", () => {
    const map = new Map([["rovia:entry:1", "x"], ["rovia:entry:2", "y"], ["diger", "z"]]);
    const storage = {
      get length() { return map.size; },
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => { map.delete(k); },
    };
    expect(clearLocalRoviaData(storage)).toBe(2);
    expect([...map.keys()]).toEqual(["diger"]);
  });
});

it("yeniden giriş adresi ayarların hesap bölümüne döner", () => {
  expect(REAUTH_REDIRECT).toBe("/giris?next=%2Fayarlar%23hesap");
});
