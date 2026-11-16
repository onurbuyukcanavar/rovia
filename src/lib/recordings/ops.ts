import { z } from "zod";

/**
 * Kayıt işlemleri. İstemci bunları sırayla yerel kuyruğa (IndexedDB) yazar, bağlantı olunca
 * gönderir. Kimlikler istemcide üretilir; sunucuda her işlem idempotenttir (tekrar gönderim güvenli).
 * Zamanlar epoch milisaniye.
 */
const epochMs = z.number().int().min(Date.UTC(2020, 0, 1));

export const gpsPointSchema = z.object({
  t: epochMs,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  acc: z.number().nullable(),
  alt: z.number().nullable().optional(),
  spd: z.number().nullable().optional(),
  hdg: z.number().nullable().optional(),
});

export const MAX_POINTS_PER_OP = 500;
export const MAX_OPS_PER_SYNC = 20;

export const recordingOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    segmentId: z.uuid(),
    at: epochMs,
    tripId: z.uuid().nullable(),
    title: z.string().trim().max(160).nullable(),
  }),
  z.object({ type: z.literal("points"), segmentId: z.uuid(), points: z.array(gpsPointSchema).min(1).max(MAX_POINTS_PER_OP) }),
  z.object({ type: z.literal("pause"), segmentId: z.uuid(), at: epochMs }),
  z.object({ type: z.literal("resume"), segmentId: z.uuid(), at: epochMs }),
  z.object({ type: z.literal("finish"), at: epochMs }),
  z.object({ type: z.literal("cancel") }),
]);

export const syncRequestSchema = z.object({
  recordingId: z.uuid(),
  ops: z.array(recordingOpSchema).min(1).max(MAX_OPS_PER_SYNC),
});

export type GpsPoint = z.infer<typeof gpsPointSchema>;
export type RecordingOp = z.infer<typeof recordingOpSchema>;
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export type SyncResponse = {
  /** Baştan itibaren uygulanan işlem sayısı (kuyruktan silinebilir) */
  applied: number;
  tripId: string | null;
  status: string | null;
  /** Uygulanamayan ilk işlem. permanent: tekrar denemek anlamsız (kayıt silinmiş, kapanmış…) */
  error?: { code: string; permanent: boolean; message: string };
};
