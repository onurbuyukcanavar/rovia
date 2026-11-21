import "server-only";
import { cacheLife } from "next/cache";
import { loadLatestRelease } from "./fetch-latest";
import type { LatestRelease } from "./version";

/**
 * En son Android sürümü: tüm kullanıcılar için paylaşılan uzak önbellekte ~10 dakika (GitHub'ın anahtarsız
 * 60 istek/saat sınırına takılmamak için). Hatalar önbelleğe girmez.
 */
export async function getLatestAndroidRelease(): Promise<LatestRelease> {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 600, expire: 3600 });
  return loadLatestRelease();
}
