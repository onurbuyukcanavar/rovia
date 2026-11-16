"use client";
import { useEffect, useEffectEvent, useState } from "react";
import { MapsClientError } from "./client";
import { t } from "@/i18n";

type Settled<T> = { key: string; data?: T; error?: string };

/**
 * Bir anahtara bağlı asenkron istek. Anahtar değişince (gecikmeyle) yeni istek atılır,
 * öncekisi iptal edilir; aynı anahtar için tekrar istek atılmaz.
 * Görünür durum render sırasında türetilir — efekt gövdesinde senkron setState yoktur.
 */
export function useKeyedRequest<T>(
  key: string | null,
  run: (signal: AbortSignal) => Promise<T>,
  { delayMs = 0, keepPrevious = false }: { delayMs?: number; keepPrevious?: boolean } = {},
) {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const onRun = useEffectEvent(run);

  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await onRun(ctrl.signal);
        if (!ctrl.signal.aborted) setSettled({ key, data });
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error)?.name === "AbortError") return;
        setSettled({ key, error: e instanceof MapsClientError ? e.message : t.maps.errors.upstream });
      }
    }, delayMs);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, delayMs]);

  if (key === null) return { data: undefined, error: undefined, loading: false };
  const current = settled?.key === key;
  return {
    data: current ? settled.data : keepPrevious ? settled?.data : undefined,
    error: current ? settled.error : undefined,
    loading: !current,
  };
}
