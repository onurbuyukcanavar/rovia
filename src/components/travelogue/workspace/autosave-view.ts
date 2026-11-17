"use client";
import type { SaveStatus } from "@/components/travelogue/save-status";

export type AnyAutosave = Parameters<typeof SaveStatus>[0]["autosave"];

type WithBackup<P> = { backup: Partial<P> | null; restoreBackup: () => void };

/**
 * SaveStatus'a verilecek görünüm. Yerel yedek geri yüklenince (restoreBackup) yama kayıt sırasına girer;
 * formun yerel durumu da yedeği göstermeli — bunun için onRestore yedeği alır ve formu yeniden kurar.
 */
export function statusView<P, A extends WithBackup<P>>(autosave: A, onRestore: (backup: Partial<P>) => void): AnyAutosave {
  return {
    ...autosave,
    restoreBackup: () => {
      const b = autosave.backup;
      autosave.restoreBackup();
      if (b) onRestore(b);
    },
  } as unknown as AnyAutosave;
}
