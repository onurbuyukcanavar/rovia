import { describe, expect, it } from "vitest";
import { installedFromUserAgent, isAllowedApkUrl, isUpdateAvailable, parseLatestRelease, STABLE_APK_URL } from "./version";

const release = (over: Record<string, unknown> = {}) => ({
  tag_name: "android-v1.0.12",
  name: "ROVIA Android 1.0.12",
  draft: false,
  prerelease: false,
  published_at: "2026-11-22T10:00:00Z",
  body: "ROVIA Android uygulaması 1.0.12 (commit abc1234). versionCode: 12. Kurulum: https://github.com/onurbuyukcanavar/rovia/releases/latest/download/rovia.apk — ayrıntılar docs/ANDROID.md.",
  assets: [{ name: "rovia.apk", browser_download_url: "https://github.com/onurbuyukcanavar/rovia/releases/download/android-v1.0.12/rovia.apk" }],
  ...over,
});

describe("parseLatestRelease", () => {
  it("etiket, notlardaki versionCode ve tam APK adresi", () => {
    expect(parseLatestRelease(release())).toEqual({
      versionCode: 12,
      versionName: "1.0.12",
      apkUrl: "https://github.com/onurbuyukcanavar/rovia/releases/download/android-v1.0.12/rovia.apk",
      notes: "ROVIA Android uygulaması 1.0.12 (commit abc1234).",
      publishedAt: "2026-11-22T10:00:00Z",
    });
  });

  it("eski sürüm notlarında versionCode yoksa etiketten (android-v1.0.N → N)", () => {
    expect(parseLatestRelease(release({ tag_name: "android-v1.0.5", body: "ROVIA Android uygulaması 1.0.5 (commit 3ef05ec). Kurulum: …" }))?.versionCode).toBe(5);
  });

  it("izin dışı varlık adresi sabit adrese döner", () => {
    const r = parseLatestRelease(release({ assets: [{ name: "rovia.apk", browser_download_url: "https://evil.example/rovia.apk" }] }));
    expect(r?.apkUrl).toBe(STABLE_APK_URL);
  });

  it("Android dışı, taslak, APK'sız ya da bozuk yanıtlar", () => {
    expect(parseLatestRelease(release({ tag_name: "v2.0.0" }))).toBeNull();
    expect(parseLatestRelease(release({ draft: true }))).toBeNull();
    expect(parseLatestRelease(release({ prerelease: true }))).toBeNull();
    expect(parseLatestRelease(release({ assets: [] }))).toBeNull();
    expect(parseLatestRelease(release({ assets: "x" }))).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease("x")).toBeNull();
    expect(parseLatestRelease({ message: "Not Found" })).toBeNull();
  });
});

describe("kurulu sürüm ve karşılaştırma", () => {
  it("UA eki", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 RoviaAndroid/9 (1.0.9)";
    expect(installedFromUserAgent(ua)).toEqual({ versionCode: 9, versionName: "1.0.9" });
    expect(installedFromUserAgent("… RoviaAndroid/9")).toEqual({ versionCode: 9, versionName: null });
    expect(installedFromUserAgent("Mozilla/5.0 Chrome")).toBeNull();
    expect(installedFromUserAgent(null)).toBeNull();
  });

  it("yalnızca daha yüksek versionCode güncellemedir (sayısal, metinsel değil)", () => {
    expect(isUpdateAvailable({ versionCode: 10 }, { versionCode: 9 })).toBe(true);
    expect(isUpdateAvailable({ versionCode: 9 }, { versionCode: 10 })).toBe(false);
    expect(isUpdateAvailable({ versionCode: 9 }, { versionCode: 9 })).toBe(false);
    expect(isUpdateAvailable(null, { versionCode: 1 })).toBe(false);
    expect(isUpdateAvailable({ versionCode: 2 }, null)).toBe(false);
  });

  it("APK adresi izin listesi", () => {
    expect(isAllowedApkUrl(STABLE_APK_URL)).toBe(true);
    expect(isAllowedApkUrl("https://github.com/onurbuyukcanavar/rovia/releases/download/android-v1.0.3/rovia.apk")).toBe(true);
    for (const bad of ["http://github.com/onurbuyukcanavar/rovia/releases/latest/download/rovia.apk",
      "https://github.com/other/repo/releases/download/x/rovia.apk", "https://github.com.evil.io/onurbuyukcanavar/rovia/releases/download/x/rovia.apk",
      "https://github.com/onurbuyukcanavar/rovia/releases/download/x/other.apk", "javascript:alert(1)", "nope"]) {
      expect(isAllowedApkUrl(bad), bad).toBe(false);
    }
  });
});
