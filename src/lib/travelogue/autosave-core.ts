import type { SaveResult } from "./types";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "offline";

export type AutosaveSnapshot<P> = {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: string | null;
  version: number;
  /** Önceki oturumdan kalan, sunucuya ulaşmamış değişiklikler */
  backup: Partial<P> | null;
};

export type SaveFn<P> = (args: { patch: Partial<P>; version: number; force: boolean }) => Promise<SaveResult>;

/** localStorage benzeri, yalnızca gereken kadarı (testte bellek içi taklit edilir). */
export type BackupStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AutosaveCoreOptions<P> = {
  key: string;
  version: number;
  save: SaveFn<P>;
  delayMs?: number;
  storage?: BackupStorage | null;
  isOnline?: () => boolean;
  /** Başarısız sonuç geçici mi (tekrar denenir)? Fırlatılan hatalar her zaman geçici sayılır. */
  isTransient?: (result: Extract<SaveResult, { ok: false }>) => boolean;
  /** Ardışık geçici hatalardan sonraki bekleme süreleri (ms); son değer tekrar edilir */
  backoffMs?: readonly number[];
  /** Bu kadar denemeden sonra otomatik deneme durur (kullanıcı flush ile tekrar dener) */
  maxRetries?: number;
  messages?: { network: string };
};

type StoredBackup<P> = { patch: Partial<P>; version: number; at: number };

const DEFAULT_BACKOFF = [2_000, 5_000, 15_000, 30_000, 60_000] as const;

/**
 * Otomatik kaydetmenin saf çekirdeği (React'ten bağımsız, test edilebilir).
 * - Aynı anda tek kayıt isteği; kayıt sürerken gelen düzenlemeler sıraya alınır ve yeni sürümle gönderilir.
 * - Bekleyen yama, onaylanana dek depoya (localStorage) yansıtılır.
 * - Çakışmada durur; geçici hatalarda artan beklemeyle yeniden dener; çevrimdışıyken bekler.
 */
export class AutosaveCore<P extends Record<string, unknown>> {
  private opts: Required<Omit<AutosaveCoreOptions<P>, "storage" | "messages">> & { storage: BackupStorage | null; messages: { network: string } };
  private pending: Partial<P> | null = null;
  private inflight: Partial<P> | null = null;
  private inflightPromise: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private listeners = new Set<() => void>();
  private disposed = false;
  private snap: AutosaveSnapshot<P>;

  constructor(options: AutosaveCoreOptions<P>) {
    this.opts = {
      delayMs: 1200,
      storage: null,
      isOnline: () => true,
      isTransient: () => false,
      backoffMs: DEFAULT_BACKOFF,
      maxRetries: 6,
      messages: { network: "Bağlantı hatası" },
      ...options,
    } as typeof this.opts;
    this.snap = { status: "idle", lastSavedAt: null, error: null, version: options.version, backup: null };
  }

  // ------------------------------------------------------------------ abonelik
  getSnapshot = (): AutosaveSnapshot<P> => this.snap;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private set(next: Partial<AutosaveSnapshot<P>>) {
    this.snap = { ...this.snap, ...next };
    for (const fn of this.listeners) fn();
  }

  get hasUnsaved(): boolean {
    return this.pending !== null || this.inflight !== null;
  }

  setSave(save: SaveFn<P>) {
    this.opts.save = save;
  }

  /** Sunucudan daha yeni sürüm geldiğinde (ör. sayfa yenilendikten sonra) bekleyen değişiklik yoksa uygular. */
  syncVersion(version: number) {
    if (version > this.snap.version && !this.hasUnsaved) this.set({ version, status: this.snap.status === "conflict" ? "idle" : this.snap.status });
  }

  // ------------------------------------------------------------------ yedek
  loadBackup() {
    const raw = this.read();
    if (raw && raw.patch && typeof raw.patch === "object" && Object.keys(raw.patch).length) this.set({ backup: raw.patch });
  }
  restoreBackup() {
    const b = this.snap.backup;
    this.set({ backup: null });
    if (b) this.update(b);
  }
  discardBackup() {
    this.set({ backup: null });
    if (!this.hasUnsaved) this.remove();
  }

  private read(): StoredBackup<P> | null {
    try {
      const s = this.opts.storage?.getItem(this.opts.key);
      return s ? (JSON.parse(s) as StoredBackup<P>) : null;
    } catch {
      return null;
    }
  }
  private persist() {
    const patch = { ...this.inflight, ...this.pending } as Partial<P>;
    try {
      this.opts.storage?.setItem(this.opts.key, JSON.stringify({ patch, version: this.snap.version, at: Date.now() } satisfies StoredBackup<P>));
    } catch {
      /* depo dolu/erişilemez: yedeksiz devam */
    }
  }
  private remove() {
    try {
      this.opts.storage?.removeItem(this.opts.key);
    } catch {
      /* yok say */
    }
  }

  // ------------------------------------------------------------------ düzenleme
  update(patch: Partial<P>) {
    this.pending = { ...this.pending, ...patch };
    this.persist();
    const s = this.snap.status;
    if (s === "conflict") return; // kullanıcı karar verene dek gönderme
    this.retries = 0;
    if (s !== "saving" && s !== "offline") this.set({ status: "dirty" });
    if (!this.inflight) this.schedule(this.opts.delayMs);
  }

  private schedule(ms: number) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, ms);
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Bekleyen yamayı gönderir. Başarıda true. Zaten bir istek varsa onu bekler. */
  private run(force: boolean): Promise<boolean> {
    if (this.inflightPromise) return this.inflightPromise;
    if (!this.pending) return Promise.resolve(true);
    if (this.snap.status === "conflict" && !force) return Promise.resolve(false);
    if (!this.opts.isOnline()) {
      this.set({ status: "offline" });
      return Promise.resolve(false);
    }
    this.clearTimer();
    this.inflight = this.pending;
    this.pending = null;
    this.set({ status: "saving" });
    const patch = this.inflight;
    const p = this.opts
      .save({ patch, version: this.snap.version, force })
      .then(
        (r) => this.settle(r),
        (e: unknown) => this.settle({ ok: false, message: e instanceof Error && e.message ? e.message : this.opts.messages.network }, true),
      )
      .finally(() => {
        this.inflightPromise = null;
      });
    this.inflightPromise = p;
    return p;
  }

  private settle(r: SaveResult, thrown = false): boolean {
    const sent = this.inflight;
    this.inflight = null;
    if (r.ok) {
      this.retries = 0;
      this.set({ version: r.version, lastSavedAt: new Date(), error: null });
      if (this.pending) {
        this.persist();
        this.set({ status: "dirty" });
        if (!this.disposed) this.schedule(this.opts.delayMs);
      } else {
        this.remove();
        this.set({ status: "saved" });
      }
      return true;
    }
    // Başarısız: gönderilen yamayı geri koy (sonraki düzenlemeler üstüne yazar)
    this.pending = { ...sent, ...this.pending } as Partial<P>;
    this.persist();
    if (r.conflict) {
      this.clearTimer();
      this.set({ status: "conflict", error: r.message });
      return false;
    }
    if (!this.opts.isOnline()) {
      this.set({ status: "offline", error: null });
      return false;
    }
    this.set({ status: "error", error: r.message });
    if ((thrown || this.opts.isTransient(r)) && this.retries < this.opts.maxRetries && !this.disposed) {
      const b = this.opts.backoffMs;
      this.schedule(b[Math.min(this.retries, b.length - 1)]);
      this.retries++;
    }
    return false;
  }

  /** Bekleyen her şeyi hemen kaydeder (gezinmeden önce, "Tekrar dene"). Her şey kaydedildiyse true. */
  async flush(): Promise<boolean> {
    this.clearTimer();
    if (this.snap.status !== "conflict") this.retries = 0;
    for (let i = 0; i < 20; i++) {
      if (this.inflightPromise) {
        await this.inflightPromise;
        continue;
      }
      if (!this.pending) return this.snap.status !== "conflict";
      if (this.snap.status === "conflict") return false;
      const ok = await this.run(false);
      if (!ok) return false;
    }
    return !this.hasUnsaved;
  }

  resolveConflict(choice: "mine" | "theirs") {
    if (choice === "theirs") {
      this.clearTimer();
      this.pending = null;
      this.remove();
      this.set({ status: "idle", error: null, backup: null });
      return;
    }
    if (!this.pending && !this.inflight) {
      this.set({ status: "idle", error: null });
      return;
    }
    this.set({ status: "dirty", error: null });
    void this.run(true);
  }

  setOnline(online: boolean) {
    if (online) {
      if (this.snap.status === "offline") {
        this.retries = 0;
        if (this.pending) void this.run(false);
        else this.set({ status: "idle" });
      }
    } else if (this.snap.status !== "conflict" && this.hasUnsaved && !this.inflight) {
      this.clearTimer();
      this.set({ status: "offline" });
    }
  }

  /** Bileşen bağlandığında (StrictMode yeniden bağlamayı destekler) */
  attach() {
    this.disposed = false;
  }

  /** Zamanlayıcıları durdurur; bekleyen değişiklikler flush ile hâlâ gönderilebilir. */
  dispose() {
    this.disposed = true;
    this.clearTimer();
  }
}
