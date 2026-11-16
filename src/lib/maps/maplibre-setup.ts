"use client";
import { getVersion, setWorkerUrl } from "maplibre-gl";

/**
 * MapLibre worker'ının adresi (scripts/copy-maplibre-worker.mjs derlemede public/ altına kopyalar).
 * Sürüm sorgu parametresi, kütüphane güncellenince tarayıcının eski worker'ı önbellekten kullanmasını önler.
 * Harita bileşenlerinden önce içe aktarılmalıdır (yan etkili modül).
 */
export const MAPLIBRE_WORKER_URL = `/maplibre/maplibre-gl-worker.js?v=${getVersion()}`;
setWorkerUrl(MAPLIBRE_WORKER_URL);
