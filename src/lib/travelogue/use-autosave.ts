"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AutosaveCore, type AutosaveSnapshot, type AutosaveStatus } from "./autosave-core";
import type { SaveResult } from "./types";
import { t } from "@/i18n";

export type { AutosaveStatus };

type Opts<P> = {
  /** localStorage yedek anahtarı, ör. `rovia:entry:${id}` */
  key: string;
  /** Sunucudaki ilk sürüm */
  version: number;
  save: (args: { patch: Partial<P>; version: number; force: boolean }) => Promise<SaveResult>;
  /** Bekleme süresi (ms), varsayılan 1200 */
  delayMs?: number;
};

function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Sürüm denetimli otomatik kaydetme. Mantık AutosaveCore'da; bu kanca yalnızca tarayıcı olaylarını bağlar
 * (çevrimiçi/dışı, sekme gizlenince kaydet, kaydedilmemişken çıkış uyarısı).
 */
export function useAutosave<P extends Record<string, unknown>>(opts: Opts<P>) {
  const { key, version, save, delayMs } = opts;
  const [core] = useState(
    () =>
      new AutosaveCore<P>({
        key,
        version,
        save,
        delayMs,
        storage: browserStorage(),
        isOnline: () => typeof navigator === "undefined" || navigator.onLine !== false,
        isTransient: (r) => r.message === t.travelogue.errors.rateLimited,
        messages: { network: t.travelogue.editor.save.network },
      }),
  );
  const snap: AutosaveSnapshot<P> = useSyncExternalStore(core.subscribe, core.getSnapshot, core.getSnapshot);

  useEffect(() => {
    core.setSave(save);
  }, [core, save]);

  useEffect(() => {
    core.syncVersion(version);
  }, [core, version]);

  useEffect(() => {
    core.attach();
    core.loadBackup();
    const online = () => core.setOnline(true);
    const offline = () => core.setOnline(false);
    const hidden = () => {
      if (document.visibilityState === "hidden") void core.flush();
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (!core.hasUnsaved) return;
      e.preventDefault();
      e.returnValue = t.travelogue.editor.save.unloadWarning;
      return t.travelogue.editor.save.unloadWarning;
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", hidden);
      // Uygulama içi gezinmede bekleyenleri gönder (yedek localStorage'da kalır)
      void core.flush();
      core.dispose();
    };
  }, [core]);

  return {
    status: snap.status,
    lastSavedAt: snap.lastSavedAt,
    error: snap.error,
    version: snap.version,
    backup: snap.backup,
    update: (patch: Partial<P>) => core.update(patch),
    flush: () => core.flush(),
    resolveConflict: (choice: "mine" | "theirs") => core.resolveConflict(choice),
    restoreBackup: () => core.restoreBackup(),
    discardBackup: () => core.discardBackup(),
  };
}
