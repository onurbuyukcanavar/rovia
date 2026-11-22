import { connection } from "next/server";
import { getLatestAndroidRelease } from "@/lib/app-update/server";

/**
 * En son Android uygulama sürümü: { versionCode, versionName, apkUrl, notes, publishedAt }.
 * Herkese açık bilgi (GitHub Releases); sunucu tarafında ~10 dk önbellekli. Uygulama içi güncelleme bildirimi kullanır.
 */
export async function GET(): Promise<Response> {
  // Derlemede önceden çizilmesin (sürüm her yayında değişir): her istekte çalışır, veri uzak önbellekten gelir
  await connection();
  try {
    const latest = await getLatestAndroidRelease();
    return Response.json(latest, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (e) {
    console.warn("[app-update] en son sürüm okunamadı:", (e as Error)?.message);
    return Response.json({ error: { code: "unavailable" } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
