"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** İstemci tarafında hidrasyon tamamlandıysa true (sunucuda ve ilk hidrasyonda false). */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
