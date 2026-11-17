"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Sunucudaki güncel hâli yeniden yükler ve yenileme bitince düzenleyicileri yeniden kurmak için
 * `gen` değerini artırır (bileşen anahtarı olarak kullanılır). Çakışmada "sunucudakini al",
 * sürüm geri yükleme gibi durumlarda yerel durum ve otomatik kayıt sürümü böylece sıfırlanır.
 */
export function useServerReload() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [requested, setRequested] = useState(false);
  const [gen, setGen] = useState(0);
  if (requested && !pending) {
    setRequested(false);
    setGen((g) => g + 1);
  }
  return {
    gen,
    reloading: requested,
    reload: () => {
      setRequested(true);
      start(() => router.refresh());
    },
    /** Yenilemeden yalnızca yeniden kur (ör. yerel yedeği geri yükledikten sonra) */
    remount: () => setGen((g) => g + 1),
  };
}
