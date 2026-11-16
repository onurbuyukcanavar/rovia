"use client";
import { useCallback, useState } from "react";
import type { LatLng } from "@/lib/geo";
import { t } from "@/i18n";

type State = { status: "idle" | "locating" | "ok" | "error"; position: LatLng | null; accuracy: number | null; error: string | null };

/**
 * Konum yalnızca kullanıcı bir düğmeye bastığında ve tarayıcı izni verildiğinde alınır (brief §6.1, §19).
 * Sürekli takip burada yok; GPS kaydı PHASE 4'te ayrı bir modüldür.
 */
export function useGeolocation() {
  const [state, setState] = useState<State>({ status: "idle", position: null, accuracy: null, error: null });

  const locate = useCallback((): Promise<LatLng | null> => {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (!window.isSecureContext) {
      setState((s) => ({ ...s, status: "error", error: t.maps.insecureContext }));
      return Promise.resolve(null);
    }
    if (!("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "error", error: t.maps.geolocationUnsupported }));
      return Promise.resolve(null);
    }
    setState((s) => ({ ...s, status: "locating", error: null }));
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setState({ status: "ok", position, accuracy: pos.coords.accuracy, error: null });
          resolve(position);
        },
        (err) => {
          const error = err.code === err.PERMISSION_DENIED ? t.maps.geolocationDenied : t.maps.geolocationUnavailable;
          setState((s) => ({ ...s, status: "error", error }));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
      );
    });
  }, []);

  return { ...state, locate };
}
