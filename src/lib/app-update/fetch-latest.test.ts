import { describe, expect, it, vi } from "vitest";
import { LATEST_RELEASE_API, loadLatestRelease, ReleaseUnavailableError } from "./fetch-latest";

const ok = {
  tag_name: "android-v1.0.7",
  body: "ROVIA Android uygulaması 1.0.7 (commit 1234567). versionCode: 7. Kurulum: …",
  assets: [{ name: "rovia.apk", browser_download_url: "https://github.com/onurbuyukcanavar/rovia/releases/download/android-v1.0.7/rovia.apk" }],
};
const mock = (impl: () => Promise<Response>) => vi.fn(impl) as unknown as typeof fetch;

describe("loadLatestRelease", () => {
  it("GitHub API'sini çağırır ve sürümü ayrıştırır", async () => {
    const f = mock(async () => Response.json(ok));
    await expect(loadLatestRelease(f)).resolves.toMatchObject({ versionCode: 7, versionName: "1.0.7" });
    expect(vi.mocked(f).mock.calls[0][0]).toBe(LATEST_RELEASE_API);
  });

  it("HTTP hatası, ağ hatası ve uygunsuz yanıt", async () => {
    await expect(loadLatestRelease(mock(async () => new Response("rate limited", { status: 403 })))).rejects.toBeInstanceOf(ReleaseUnavailableError);
    await expect(loadLatestRelease(mock(async () => { throw new TypeError("fetch failed"); }))).rejects.toBeInstanceOf(ReleaseUnavailableError);
    await expect(loadLatestRelease(mock(async () => Response.json({ tag_name: "v1" })))).rejects.toThrow("no android release");
    await expect(loadLatestRelease(mock(async () => new Response("<html>")))).rejects.toThrow("no android release");
  });
});
