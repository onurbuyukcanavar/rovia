import { describe, expect, it } from "vitest";
import {
  chooseGoogleSignInMethod, createGoogleNonce, gisButtonConfig, gisButtonWidth, idTokenErrorFallsBack,
  nativeGoogleErrorOutcome, sha256Hex, shouldLoadGis,
} from "./google-id";
import { googleIdTokenErrorMessage } from "@/lib/auth-errors";
import { nativeErrorCode } from "@/lib/native/google-auth";
import { GOOGLE_CLIENT_ID_RE } from "@/lib/env";
import { t } from "@/i18n";

const CID = "1234567890-abcdef.apps.googleusercontent.com";

describe("nonce", () => {
  it("SHA-256 onaltılık özet (bilinen vektör)", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("ham nonce 256 bit rastgele; özet hamın SHA-256'sı; her çağrıda farklı", async () => {
    const a = await createGoogleNonce();
    const b = await createGoogleNonce();
    expect(a.raw).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hashed).toBe(await sha256Hex(a.raw));
    expect(a.raw).not.toBe(a.hashed);
    expect(a.raw).not.toBe(b.raw);
  });
});

describe("giriş yolu seçimi (yedek akış)", () => {
  it("tarayıcı: kimlik + GIS hazır → gis; aksi hâlde OAuth yönlendirmesi", () => {
    expect(chooseGoogleSignInMethod({ clientId: CID, nativeApp: false, nativePlugin: false, gis: "ready" })).toBe("gis");
    expect(chooseGoogleSignInMethod({ clientId: CID, nativeApp: false, nativePlugin: false, gis: "loading" })).toBe("oauth-redirect");
    expect(chooseGoogleSignInMethod({ clientId: CID, nativeApp: false, nativePlugin: false, gis: "failed" })).toBe("oauth-redirect");
    expect(chooseGoogleSignInMethod({ clientId: null, nativeApp: false, nativePlugin: false, gis: "ready" })).toBe("oauth-redirect");
  });

  it("Android: eklenti + kimlik → yerel; eski APK ya da kimlik yok → Custom Tab; GIS hiç kullanılmaz", () => {
    expect(chooseGoogleSignInMethod({ clientId: CID, nativeApp: true, nativePlugin: true, gis: "ready" })).toBe("native");
    expect(chooseGoogleSignInMethod({ clientId: CID, nativeApp: true, nativePlugin: false, gis: "ready" })).toBe("oauth-custom-tab");
    expect(chooseGoogleSignInMethod({ clientId: null, nativeApp: true, nativePlugin: true, gis: "ready" })).toBe("oauth-custom-tab");
  });

  it("GIS yalnızca tarayıcıda ve kimlik varken yüklenir", () => {
    expect(shouldLoadGis({ clientId: CID, nativeApp: false })).toBe(true);
    expect(shouldLoadGis({ clientId: CID, nativeApp: true })).toBe(false);
    expect(shouldLoadGis({ clientId: null, nativeApp: false })).toBe(false);
  });

  it("yerel hata: iptal sessiz, diğer her şey Custom Tab'a düşer", () => {
    expect(nativeGoogleErrorOutcome("canceled")).toBe("silent");
    for (const c of ["no_credential", "failed", "forbidden_origin", "interrupted", null, undefined]) {
      expect(nativeGoogleErrorOutcome(c)).toBe("fallback");
    }
    expect(nativeErrorCode({ code: "canceled", message: "canceled" })).toBe("canceled");
    expect(nativeErrorCode({ message: "no_credential" })).toBe("no_credential");
    expect(nativeErrorCode({ code: "UNIMPLEMENTED", message: "Not implemented" })).toBeNull();
    expect(nativeErrorCode("x")).toBeNull();
  });

  it("Supabase belirteç hatası: kullanıcı durumları mesaj, yapılandırma sorunları OAuth'a düşer", () => {
    for (const code of ["email_exists", "user_already_exists", "identity_already_exists", "provider_disabled", "signup_disabled", "over_request_rate_limit"]) {
      expect(idTokenErrorFallsBack({ code }), code).toBe(false);
    }
    expect(idTokenErrorFallsBack({ status: 429 })).toBe(false);
    expect(idTokenErrorFallsBack({ code: "bad_jwt" })).toBe(true);
    expect(idTokenErrorFallsBack({ status: 400 })).toBe(true);
    expect(idTokenErrorFallsBack(null)).toBe(false);
  });

  it("Türkçe hata mesajları", () => {
    expect(googleIdTokenErrorMessage({ code: "email_exists" })).toBe(t.auth.googleAccountConflict);
    expect(googleIdTokenErrorMessage({ code: "provider_disabled" })).toBe(t.auth.googleDisabled);
    expect(googleIdTokenErrorMessage({ code: "bad_jwt" })).toBe(t.auth.googleTokenRejected);
    expect(googleIdTokenErrorMessage({ status: 429 })).toBe(t.auth.rateLimited);
    expect(googleIdTokenErrorMessage({ code: "unexpected_failure" })).toBe(t.auth.googleFailed);
  });
});

describe("GIS düğmesi", () => {
  it("tema: koyu → filled_black, aydınlık → outline; tr, hap, metin bağlama göre", () => {
    expect(gisButtonConfig({ theme: "dark", width: 384, context: "signin" })).toMatchObject({
      theme: "filled_black", locale: "tr", shape: "pill", text: "continue_with", width: 384, size: "large",
    });
    expect(gisButtonConfig({ theme: "light", width: 384, context: "signup" })).toMatchObject({ theme: "outline", text: "signup_with" });
  });

  it("genişlik 200–400 aralığına sıkıştırılır", () => {
    expect(gisButtonWidth(342.7)).toBe(342);
    expect(gisButtonWidth(1000)).toBe(400);
    expect(gisButtonWidth(120)).toBe(200);
    expect(gisButtonWidth(0)).toBe(320);
    expect(gisButtonWidth(Number.NaN)).toBe(320);
  });

  it("istemci kimliği biçimi", () => {
    expect(GOOGLE_CLIENT_ID_RE.test(CID)).toBe(true);
    expect(GOOGLE_CLIENT_ID_RE.test("abc.apps.googleusercontent.com")).toBe(false);
    expect(GOOGLE_CLIENT_ID_RE.test(`${CID}.evil.com`)).toBe(false);
  });
});
