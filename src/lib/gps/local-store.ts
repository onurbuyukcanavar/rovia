import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RawPoint } from "./filter";
import type { RecordingOp } from "@/lib/recordings/ops";

/**
 * Cihazdaki kayıt verisi (IndexedDB). Sayfa yenilense, sekme kapansa ya da bağlantı kesilse de
 * süren kayıt ve gönderilmemiş işlemler kaybolmaz. Her şey kullanıcı kimliğiyle ayrılır:
 * aynı cihazda başka hesapla giriş yapılırsa bir başkasının kaydı görünmez ve gönderilmez.
 */
export type LocalSegment = { id: string; startedAt: number; endedAt: number | null };

export type LocalSession = {
  userId: string;
  recordingId: string;
  title: string;
  plannedTripId: string | null;
  /** Sunucudaki yolculuk; başlatma işlemi gönderilince öğrenilir */
  tripId: string | null;
  startedAt: number;
  status: "recording" | "paused";
  segments: LocalSegment[];
};

export type StoredPoint = RawPoint & { r: string; s: string };

export type OutboxItem = { seq: number; userId: string; recordingId: string; op: RecordingOp };

interface RoviaGpsDb extends DBSchema {
  session: { key: string; value: LocalSession };
  points: { key: [string, number]; value: StoredPoint; indexes: { byRecording: string } };
  outbox: { key: number; value: OutboxItem; indexes: { byUser: string; byRecording: string } };
}

let dbPromise: Promise<IDBPDatabase<RoviaGpsDb>> | null = null;

function db() {
  dbPromise ??= openDB<RoviaGpsDb>("rovia-gps", 1, {
    upgrade(d) {
      d.createObjectStore("session", { keyPath: "userId" });
      const points = d.createObjectStore("points", { keyPath: ["r", "t"] });
      points.createIndex("byRecording", "r");
      const outbox = d.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      outbox.createIndex("byUser", "userId");
      outbox.createIndex("byRecording", "recordingId");
    },
  });
  return dbPromise;
}

/** Testler için: bağlantıyı sıfırla. */
export function resetLocalStoreForTests() {
  dbPromise = null;
}

export async function getSession(userId: string) {
  return (await (await db()).get("session", userId)) ?? null;
}

export async function putSession(session: LocalSession) {
  await (await db()).put("session", session);
}

export async function clearSession(userId: string) {
  await (await db()).delete("session", userId);
}

export async function addPoint(point: StoredPoint) {
  await (await db()).put("points", point);
}

/** Kaydın noktaları zaman sırasıyla (anahtar [kayıt, zaman] olduğundan doğal sıralı). */
export async function getPoints(recordingId: string) {
  return (await db()).getAll("points", IDBKeyRange.bound([recordingId, -Infinity], [recordingId, Infinity]));
}

export async function deletePoints(recordingId: string) {
  await (await db()).delete("points", IDBKeyRange.bound([recordingId, -Infinity], [recordingId, Infinity]));
}

export async function enqueue(userId: string, recordingId: string, op: RecordingOp) {
  return (await db()).add("outbox", { userId, recordingId, op } as OutboxItem);
}

/** Kullanıcının bekleyen işlemleri, eklenme sırasıyla. */
export async function peekOutbox(userId: string, limit = 100): Promise<OutboxItem[]> {
  const tx = (await db()).transaction("outbox");
  const out: OutboxItem[] = [];
  let cursor = await tx.store.openCursor();
  while (cursor && out.length < limit) {
    if (cursor.value.userId === userId) out.push(cursor.value);
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

export async function countOutbox(userId: string) {
  return (await db()).countFromIndex("outbox", "byUser", userId);
}

export async function deleteOutbox(seqs: number[]) {
  const tx = (await db()).transaction("outbox", "readwrite");
  await Promise.all([...seqs.map((s) => tx.store.delete(s)), tx.done]);
}

export async function outboxForRecording(recordingId: string) {
  return (await db()).getAllFromIndex("outbox", "byRecording", recordingId);
}

export async function deleteOutboxForRecording(recordingId: string) {
  const items = await outboxForRecording(recordingId);
  await deleteOutbox(items.map((i) => i.seq));
}
