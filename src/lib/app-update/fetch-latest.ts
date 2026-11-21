import { parseLatestRelease, type LatestRelease } from "./version";

export const LATEST_RELEASE_API = "https://api.github.com/repos/onurbuyukcanavar/rovia/releases/latest";

export class ReleaseUnavailableError extends Error {
  name = "ReleaseUnavailableError";
}

/** GitHub'dan en son Android sürümü (anahtarsız; depo herkese açık). Hata/uygunsuz yanıt → ReleaseUnavailableError. */
export async function loadLatestRelease(fetchImpl: typeof fetch = fetch): Promise<LatestRelease> {
  let res: Response;
  try {
    res = await fetchImpl(LATEST_RELEASE_API, {
      headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "ROVIA" },
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    throw new ReleaseUnavailableError(String(e));
  }
  if (!res.ok) throw new ReleaseUnavailableError(`github ${res.status}`);
  const latest = parseLatestRelease(await res.json().catch(() => null));
  if (!latest) throw new ReleaseUnavailableError("no android release");
  return latest;
}
