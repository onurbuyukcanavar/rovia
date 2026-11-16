import { MAX_OPS_PER_SYNC, type SyncResponse } from "@/lib/recordings/ops";
import { deleteOutbox, deleteOutboxForRecording, peekOutbox, countOutbox, type OutboxItem } from "./local-store";

export type FlushResult = {
  pending: number;
  /** offline: ağ yok · retry: sunucu geçici olarak yanıt vermedi · auth: oturum düşmüş */
  problem: "offline" | "retry" | "auth" | null;
};

export type SyncListener = (recordingId: string, response: SyncResponse) => void;

/** Tek seferde gönderilecek en fazla nokta (istek boyutu ~200 KB) */
const MAX_POINTS_PER_REQUEST = 2000;

let inFlight: Promise<FlushResult> | null = null;

/**
 * Bekleyen işlemleri sırayla gönderir. Aynı anda tek gönderim çalışır (çağrılar birleşir).
 * Sunucu yanıtına göre: uygulananlar kuyruktan silinir; kalıcı hatada (kayıt silinmiş, kapanmış)
 * hatalı işlem atılır ve dinleyiciye bildirilir; geçici hatada kuyruk olduğu gibi bekler.
 */
export function flushOutbox(userId: string, onResponse?: SyncListener): Promise<FlushResult> {
  inFlight ??= run(userId, onResponse).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(userId: string, onResponse?: SyncListener): Promise<FlushResult> {
  for (let guard = 0; guard < 200; guard++) {
    const items = await peekOutbox(userId, 200);
    if (!items.length) return { pending: 0, problem: null };

    const batch = takeBatch(items);
    const recordingId = batch[0].recordingId;
    let res: Response;
    try {
      res = await fetch("/api/recordings/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recordingId, ops: batch.map((i) => i.op) }),
      });
    } catch {
      return { pending: await countOutbox(userId), problem: "offline" };
    }

    if (res.status === 401) return { pending: await countOutbox(userId), problem: "auth" };
    if (res.status === 400) {
      // Sunucunun kabul etmediği biçim: tekrar göndermek düzeltmez. İlk işlemi at, kalanla devam et.
      console.warn("[rovia] Geçersiz kayıt işlemi atıldı:", batch[0].op.type);
      await deleteOutbox([batch[0].seq]);
      continue;
    }
    if (!res.ok) return { pending: await countOutbox(userId), problem: "retry" };

    const body = (await res.json()) as SyncResponse;
    await deleteOutbox(batch.slice(0, body.applied).map((i) => i.seq));
    onResponse?.(recordingId, body);

    if (body.error) {
      if (!body.error.permanent) return { pending: await countOutbox(userId), problem: "retry" };
      const failed = batch[body.applied];
      if (["recording_not_found", "recording_closed", "recording_active", "trip_not_found", "trip_not_startable"].includes(body.error.code)) {
        // Kayıt sunucuda yok/kapalı: bu kayda ait bekleyen her şey anlamsız
        await deleteOutboxForRecording(recordingId);
      } else if (failed) {
        await deleteOutbox([failed.seq]);
      }
    }
  }
  return { pending: await countOutbox(userId), problem: "retry" };
}

/** Kuyruğun başından, aynı kayda ait ardışık işlemler (işlem ve nokta sınırı içinde). */
export function takeBatch(items: OutboxItem[]): OutboxItem[] {
  const batch: OutboxItem[] = [];
  let points = 0;
  for (const item of items) {
    if (item.recordingId !== items[0].recordingId) break;
    const n = item.op.type === "points" ? item.op.points.length : 0;
    if (batch.length && (batch.length >= MAX_OPS_PER_SYNC || points + n > MAX_POINTS_PER_REQUEST)) break;
    batch.push(item);
    points += n;
  }
  return batch;
}
