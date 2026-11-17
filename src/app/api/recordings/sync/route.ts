import { mapsHandler } from "@/lib/api/maps-handler";
import { syncRequestSchema } from "@/lib/recordings/ops";
import { applyRecordingOps } from "@/lib/recordings/server";

/**
 * GPS kaydı senkronu: istemcinin çevrimdışı kuyruğundaki işlemleri sırayla uygular.
 * Oturum, doğrulama ve kullanıcı başı hız sınırı ('gps' kovası) sarmalayıcıda.
 */
export const POST = mapsHandler("gps", syncRequestSchema, ({ recordingId, ops }, db) => applyRecordingOps(db, recordingId, ops), {
  // 20 işlem × 500 nokta: meşru en büyük senkron ~1,5 MB
  maxBodyBytes: 2 * 1024 * 1024,
});
