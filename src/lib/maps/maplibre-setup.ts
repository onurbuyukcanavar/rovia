"use client";
import { createElement, type ComponentProps } from "react";
import MapGL from "react-map-gl/maplibre";

type MapLibModule = typeof import("maplibre-gl");

let mapLibPromise: Promise<MapLibModule> | null = null;

/**
 * maplibre-gl'i (≈250 KB gzip) yalnızca bir harita gerçekten çizileceğinde, ayrı bir parça olarak yükler
 * ve worker adresini ayarlar (scripts/copy-maplibre-worker.mjs derlemede public/ altına kopyalar).
 * Sürüm sorgu parametresi, kütüphane güncellenince tarayıcının eski worker'ı önbellekten kullanmasını önler.
 * Statik `import "maplibre-gl"` YAPMAYIN: kütüphaneyi rotanın ilk yükleme paketine geri sokar.
 */
export function loadMapLib(): Promise<MapLibModule> {
  mapLibPromise ??= import("maplibre-gl").then((m) => {
    const lib = ((m as { default?: MapLibModule }).default ?? m) as MapLibModule;
    lib.setWorkerUrl(`/maplibre/maplibre-gl-worker.js?v=${lib.getVersion()}`);
    return lib;
  });
  return mapLibPromise;
}

/** Fare ile üzerine gelinince / görünür olmadan önce kütüphaneyi ısıtmak için. */
export function preloadMapLib() {
  if (typeof window !== "undefined") void loadMapLib();
}

/**
 * react-map-gl `Map` sarmalayıcısı: maplibre-gl'i tembel yüklenen, worker'ı ayarlanmış modülle besler.
 * Tüm haritalar bunu kullanmalı (doğrudan `react-map-gl/maplibre` varsayılan dışa aktarımı değil).
 */
export function MapView(props: ComponentProps<typeof MapGL>) {
  return createElement(MapGL, { ...props, mapLib: loadMapLib() });
}
