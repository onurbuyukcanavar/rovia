import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingOp, SyncResponse } from "@/lib/recordings/ops";
import {
  addPoint, clearSession, countOutbox, deletePoints, enqueue, getPoints, getSession, peekOutbox, putSession, resetLocalStoreForTests,
} from "./local-store";
import { flushOutbox, takeBatch } from "./sync-client";

const U = "user-a";
const R = "8d7b6c1e-3f0a-4e7b-9a52-1c2d3e4f5a6b";
const SEG = "0d1a2b3c-4d5e-4f60-8a71-b2c3d4e5f607";
const pts = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ t: 1_790_000_000_000 + (from + i) * 1000, lat: 40, lng: 30, acc: 5 }));

type Call = { recordingId: string; ops: RecordingOp[] };
let calls: Call[];

function mockServer(handler: (call: Call) => { status?: number; body?: SyncResponse } | "network") {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const call = JSON.parse(String(init.body)) as Call;
    calls.push(call);
    const r = handler(call);
    if (r === "network") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetLocalStoreForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe("yerel depo", () => {
  it("oturum kullanıcıya göre ayrılır; noktalar kayıt bazında zaman sırasıyla", async () => {
    await putSession({ userId: U, recordingId: R, title: "x", plannedTripId: null, tripId: null, startedAt: 1, status: "recording", segments: [] });
    expect((await getSession(U))?.recordingId).toBe(R);
    expect(await getSession("user-b")).toBeNull();
    for (const p of [...pts(3, 5), ...pts(3, 0)]) await addPoint({ ...p, r: R, s: SEG });
    await addPoint({ ...pts(1)[0], r: "other", s: SEG });
    expect((await getPoints(R)).map((p) => p.t - 1_790_000_000_000)).toEqual([0, 1000, 2000, 5000, 6000, 7000]);
    await deletePoints(R);
    expect(await getPoints(R)).toEqual([]);
    expect(await getPoints("other")).toHaveLength(1);
    await clearSession(U);
    expect(await getSession(U)).toBeNull();
  });

  it("kuyruk eklenme sırasını korur ve kullanıcıya göre filtreler", async () => {
    await enqueue(U, R, { type: "start", segmentId: SEG, at: 1_790_000_000_000, tripId: null, title: "a" });
    await enqueue("user-b", R, { type: "cancel" });
    await enqueue(U, R, { type: "finish", at: 1_790_000_100_000 });
    expect((await peekOutbox(U)).map((i) => i.op.type)).toEqual(["start", "finish"]);
    expect(await countOutbox(U)).toBe(2);
  });
});

describe("takeBatch", () => {
  it("aynı kayda ait ardışık işlemleri, işlem ve nokta sınırıyla alır", async () => {
    const mk = (seq: number, recordingId: string, op: RecordingOp) => ({ seq, userId: U, recordingId, op });
    const items = [
      mk(1, R, { type: "points", segmentId: SEG, points: pts(500) }),
      mk(2, R, { type: "points", segmentId: SEG, points: pts(500) }),
      mk(3, R, { type: "points", segmentId: SEG, points: pts(500) }),
      mk(4, R, { type: "points", segmentId: SEG, points: pts(500) }),
      mk(5, R, { type: "points", segmentId: SEG, points: pts(500) }),
    ];
    expect(takeBatch(items).map((i) => i.seq)).toEqual([1, 2, 3, 4]);
    expect(takeBatch([mk(1, R, { type: "cancel" }), mk(2, "other", { type: "cancel" })]).map((i) => i.seq)).toEqual([1]);
  });
});

describe("flushOutbox", () => {
  beforeEach(async () => {
    await enqueue(U, R, { type: "start", segmentId: SEG, at: 1_790_000_000_000, tripId: null, title: "a" });
    await enqueue(U, R, { type: "points", segmentId: SEG, points: pts(10) });
    await enqueue(U, R, { type: "pause", segmentId: SEG, at: 1_790_000_020_000 });
  });

  it("başarılı gönderimde kuyruk boşalır ve yanıt bildirilir", async () => {
    mockServer(({ ops }) => ({ body: { applied: ops.length, tripId: "trip-1", status: "paused" } }));
    const seen: SyncResponse[] = [];
    const r = await flushOutbox(U, (_id, res) => seen.push(res));
    expect(r).toEqual({ pending: 0, problem: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].ops.map((o) => o.type)).toEqual(["start", "points", "pause"]);
    expect(seen[0].tripId).toBe("trip-1");
  });

  it("çevrimdışıyken kuyruk korunur; bağlantı gelince aynı işlemler gönderilir", async () => {
    mockServer(() => "network");
    expect(await flushOutbox(U)).toEqual({ pending: 3, problem: "offline" });
    mockServer(({ ops }) => ({ body: { applied: ops.length, tripId: "t", status: "paused" } }));
    expect(await flushOutbox(U)).toEqual({ pending: 0, problem: null });
    expect(calls[0].ops).toHaveLength(3);
  });

  it("kısmi uygulama + geçici hata: uygulananlar silinir, kalanı bekler", async () => {
    mockServer(() => ({ body: { applied: 1, tripId: "t", status: "recording", error: { code: "unavailable", permanent: false, message: "" } } }));
    expect(await flushOutbox(U)).toEqual({ pending: 2, problem: "retry" });
    expect((await peekOutbox(U)).map((i) => i.op.type)).toEqual(["points", "pause"]);
  });

  it("kalıcı hata (kayıt başka cihazda iptal edilmiş): o kayda ait tüm işlemler atılır", async () => {
    await enqueue(U, "another-rec", { type: "cancel" });
    mockServer(({ recordingId }) =>
      recordingId === R
        ? { body: { applied: 0, tripId: null, status: null, error: { code: "recording_not_found", permanent: true, message: "" } } }
        : { body: { applied: 1, tripId: null, status: "cancelled" } },
    );
    expect(await flushOutbox(U)).toEqual({ pending: 0, problem: null });
    expect(calls.map((c) => c.recordingId)).toEqual([R, "another-rec"]);
  });

  it("sunucu hatası (5xx) ve oturum düşmesi kuyruğu silmez", async () => {
    mockServer(() => ({ status: 503 }));
    expect(await flushOutbox(U)).toEqual({ pending: 3, problem: "retry" });
    mockServer(() => ({ status: 401 }));
    expect(await flushOutbox(U)).toEqual({ pending: 3, problem: "auth" });
  });

  it("eşzamanlı çağrılar tek gönderimde birleşir", async () => {
    mockServer(({ ops }) => ({ body: { applied: ops.length, tripId: "t", status: "paused" } }));
    const [a, b] = await Promise.all([flushOutbox(U), flushOutbox(U)]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });
});
