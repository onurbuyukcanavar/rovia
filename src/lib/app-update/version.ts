/**
 * Android uygulama sürümleri — saf yardımcılar (sunucu ve istemci).
 *
 * android.yml: versionCode = GitHub run_number, versionName = "1.0.<run_number>", etiket "android-v1.0.<run_number>",
 * sürüm notlarında "versionCode: N". Kurulu uygulama kendini UA'da " RoviaAndroid/<versionCode> (<versionName>)" ile
 * ve RoviaUpdater eklentisinin getVersion() yöntemiyle bildirir.
 */

export type LatestRelease = {
  versionCode: number;
  versionName: string;
  /** İndirme adresi: yalnızca github.com (https) */
  apkUrl: string;
  notes: string | null;
  publishedAt: string | null;
};

export type InstalledVersion = { versionCode: number; versionName: string | null };

/** Sabit "en son" indirme adresi (/indir ve ilk kurulum bunu kullanır). */
export const STABLE_APK_URL = "https://github.com/onurbuyukcanavar/rovia/releases/latest/download/rovia.apk";
const RELEASE_PREFIX = "https://github.com/onurbuyukcanavar/rovia/releases/download/";

/** Uygulamanın indirmesine izin verilen APK adresi (yerel tarafta da ayrıca denetlenir). */
export function isAllowedApkUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" && !u.port && !u.username && !u.password
      && (url === STABLE_APK_URL || (url.startsWith(RELEASE_PREFIX) && u.pathname.endsWith("/rovia.apk")));
  } catch {
    return false;
  }
}

type GhAsset = { name?: unknown; browser_download_url?: unknown };
type GhRelease = { tag_name?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown; published_at?: unknown; assets?: unknown };

/** GitHub "latest release" yanıtından sürüm; Android sürümü değilse ya da APK yoksa null. */
export function parseLatestRelease(json: unknown): LatestRelease | null {
  if (!json || typeof json !== "object") return null;
  const r = json as GhRelease;
  if (r.draft === true || r.prerelease === true || typeof r.tag_name !== "string") return null;
  const tag = r.tag_name.match(/^android-v(\d{1,4}\.\d{1,4}\.(\d{1,9}))$/);
  if (!tag) return null;
  const body = typeof r.body === "string" ? r.body : "";
  const fromBody = body.match(/versionCode:\s*(\d{1,9})/);
  const versionCode = Number(fromBody?.[1] ?? tag[2]);
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) return null;

  const assets = Array.isArray(r.assets) ? (r.assets as GhAsset[]) : [];
  const apk = assets.find((a) => a?.name === "rovia.apk" && typeof a.browser_download_url === "string");
  if (!apk) return null;
  const exact = apk.browser_download_url as string;
  const apkUrl = isAllowedApkUrl(exact) ? exact : STABLE_APK_URL;
  // Notlardaki kurulum satırı ve teknik ayrıntılar kullanıcıya gösterilmez; kısa bir özet yeter
  const notes = body.split(/\s+Kurulum:/)[0].replace(/\s*versionCode:\s*\d+\.?/, "").trim().slice(0, 300) || null;
  return {
    versionCode,
    versionName: tag[1],
    apkUrl,
    notes,
    publishedAt: typeof r.published_at === "string" ? r.published_at : null,
  };
}

/** WebView UA'sındaki "RoviaAndroid/<code> (<name>)" eki. */
export function installedFromUserAgent(ua: string | null | undefined): InstalledVersion | null {
  const m = ua?.match(/\bRoviaAndroid\/(\d{1,9})(?: \(([\w.-]{1,32})\))?/);
  if (!m) return null;
  return { versionCode: Number(m[1]), versionName: m[2] ?? null };
}

export function isUpdateAvailable(latest: Pick<LatestRelease, "versionCode"> | null, installed: Pick<InstalledVersion, "versionCode"> | null): boolean {
  return !!latest && !!installed && latest.versionCode > installed.versionCode;
}

/** Kapatılan güncelleme bildirimi (sürüm başına hatırlanır). */
export const DISMISS_KEY = "rovia-update-dismissed";
