import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveCore, type BackupStorage, type SaveFn } from "./autosave-core";
import type { SaveResult } from "./types";

type P = { title: string; body: string };

function memoryStorage(): BackupStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const ok = (version: number): SaveResult => ({ ok: true, version, updatedAt: new Date().toISOString() });

describe("AutosaveCore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces and merges patches into a single save", async () => {
    const save = vi.fn<SaveFn<P>>(async ({ version }) => ok(version + 1));
    const storage = memoryStorage();
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 1000, storage });
    core.update({ title: "a" });
    await vi.advanceTimersByTimeAsync(500);
    core.update({ body: "b" });
    expect(core.getSnapshot().status).toBe("dirty");
    expect(JSON.parse(storage.data.get("k")!).patch).toEqual({ title: "a", body: "b" });
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ patch: { title: "a", body: "b" }, version: 1, force: false });
    await vi.runAllTimersAsync();
    const s = core.getSnapshot();
    expect(s.status).toBe("saved");
    expect(s.version).toBe(2);
    expect(s.lastSavedAt).toBeInstanceOf(Date);
    expect(storage.data.has("k")).toBe(false);
  });

  it("keeps one save in flight and sends queued edits afterwards with the new version", async () => {
    const first = deferred<SaveResult>();
    const save = vi.fn<SaveFn<P>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async ({ version }) => ok(version + 1));
    const storage = memoryStorage();
    const core = new AutosaveCore<P>({ key: "k", version: 5, save, delayMs: 100, storage });
    core.update({ title: "a" });
    await vi.advanceTimersByTimeAsync(100);
    expect(core.getSnapshot().status).toBe("saving");
    core.update({ title: "ab" });
    core.update({ body: "x" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    // yedek hem gönderilmekte olanı hem sıradakini taşır
    expect(JSON.parse(storage.data.get("k")!).patch).toEqual({ title: "ab", body: "x" });
    first.resolve(ok(6));
    await vi.advanceTimersByTimeAsync(0);
    expect(core.getSnapshot().status).toBe("dirty");
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual({ patch: { title: "ab", body: "x" }, version: 6, force: false });
    await vi.runAllTimersAsync();
    expect(core.getSnapshot()).toMatchObject({ status: "saved", version: 7 });
  });

  it("stops on conflict and resolves with 'mine' (force) or 'theirs' (drop)", async () => {
    const save = vi.fn<SaveFn<P>>()
      .mockResolvedValueOnce({ ok: false, conflict: true, serverVersion: 9, message: "çakışma" })
      .mockImplementation(async () => ok(10));
    const storage = memoryStorage();
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 10, storage });
    core.update({ title: "a" });
    await vi.runAllTimersAsync();
    expect(core.getSnapshot()).toMatchObject({ status: "conflict", error: "çakışma" });
    core.update({ body: "more" });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(await core.flush()).toBe(false);

    core.resolveConflict("mine");
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual({ patch: { title: "a", body: "more" }, version: 1, force: true });
    expect(core.getSnapshot()).toMatchObject({ status: "saved", version: 10 });
  });

  it("'theirs' drops pending edits and backup", async () => {
    const save = vi.fn<SaveFn<P>>().mockResolvedValue({ ok: false, conflict: true, serverVersion: 3, message: "c" });
    const storage = memoryStorage();
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 10, storage });
    core.update({ title: "a" });
    await vi.runAllTimersAsync();
    core.resolveConflict("theirs");
    expect(core.getSnapshot().status).toBe("idle");
    expect(core.hasUnsaved).toBe(false);
    expect(storage.data.has("k")).toBe(false);
    core.syncVersion(3);
    expect(core.getSnapshot().version).toBe(3);
  });

  it("retries transient failures with backoff", async () => {
    const save = vi.fn<SaveFn<P>>()
      .mockRejectedValueOnce(new Error("ağ"))
      .mockResolvedValueOnce({ ok: false, message: "rate" })
      .mockImplementation(async () => ok(2));
    const core = new AutosaveCore<P>({
      key: "k", version: 1, save, delayMs: 10, backoffMs: [1000, 3000], isTransient: (r) => r.message === "rate",
    });
    core.update({ title: "a" });
    await vi.advanceTimersByTimeAsync(10);
    expect(core.getSnapshot()).toMatchObject({ status: "error", error: "ağ" });
    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(core.getSnapshot().error).toBe("rate");
    await vi.advanceTimersByTimeAsync(2999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(core.getSnapshot()).toMatchObject({ status: "saved", error: null });
  });

  it("does not auto-retry permanent failures, but flush retries", async () => {
    const save = vi.fn<SaveFn<P>>().mockResolvedValueOnce({ ok: false, message: "geçersiz" }).mockResolvedValue(ok(2));
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 10 });
    core.update({ title: "a" });
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledTimes(1);
    expect(core.getSnapshot().status).toBe("error");
    expect(await core.flush()).toBe(true);
    expect(core.getSnapshot().status).toBe("saved");
  });

  it("waits while offline and resumes when back online", async () => {
    let online = false;
    const save = vi.fn<SaveFn<P>>(async () => ok(2));
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 10, isOnline: () => online });
    core.update({ title: "a" });
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
    expect(core.getSnapshot().status).toBe("offline");
    core.update({ body: "b" });
    expect(core.getSnapshot().status).toBe("offline");
    online = true;
    core.setOnline(true);
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledWith({ patch: { title: "a", body: "b" }, version: 1, force: false });
    expect(core.getSnapshot().status).toBe("saved");
  });

  it("flush saves immediately and waits for queued edits", async () => {
    const save = vi.fn<SaveFn<P>>(async ({ version }) => ok(version + 1));
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 10_000 });
    core.update({ title: "a" });
    const p = core.flush();
    core.update({ body: "b" }); // kayıt sürerken
    expect(await p).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(core.getSnapshot()).toMatchObject({ status: "saved", version: 3 });
    expect(await core.flush()).toBe(true);
  });

  it("exposes a backup from an earlier session without applying it", async () => {
    const storage = memoryStorage();
    storage.setItem("k", JSON.stringify({ patch: { title: "eski" }, version: 1, at: 0 }));
    const save = vi.fn<SaveFn<P>>(async () => ok(2));
    const core = new AutosaveCore<P>({ key: "k", version: 1, save, delayMs: 10, storage });
    core.loadBackup();
    expect(core.getSnapshot().backup).toEqual({ title: "eski" });
    await vi.runAllTimersAsync();
    expect(save).not.toHaveBeenCalled();
    core.restoreBackup();
    expect(core.getSnapshot().backup).toBeNull();
    await vi.runAllTimersAsync();
    expect(save).toHaveBeenCalledWith({ patch: { title: "eski" }, version: 1, force: false });

    const s2 = memoryStorage();
    s2.setItem("k", JSON.stringify({ patch: { title: "x" }, version: 1, at: 0 }));
    const c2 = new AutosaveCore<P>({ key: "k", version: 1, save, storage: s2 });
    c2.loadBackup();
    c2.discardBackup();
    expect(c2.getSnapshot().backup).toBeNull();
    expect(s2.data.has("k")).toBe(false);
  });

  it("notifies subscribers", () => {
    const core = new AutosaveCore<P>({ key: "k", version: 1, save: async () => ok(2) });
    const fn = vi.fn();
    const off = core.subscribe(fn);
    core.update({ title: "a" });
    expect(fn).toHaveBeenCalled();
    off();
    core.dispose();
  });
});
