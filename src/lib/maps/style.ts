/**
 * Harita stilinin temaya göre seçimi. Saf modül (sunucu/istemci/test).
 *
 * OpenFreeMap aynı vektör karo kaynağı (tiles.openfreemap.org/planet), sprite ve yazı tipleriyle
 * bir koyu stil de sunar: "dark" (OpenMapTiles Dark Matter çatalı). Adres, openfreemap-styles deposunun
 * README'sinden doğrulandı (https://github.com/hyperknot/openfreemap-styles → "To access Dark and Fiord").
 * Aynı alan adında olduğundan CSP'de (src/lib/security/headers.ts → DEFAULT_MAP_HOST) değişiklik gerekmez.
 *
 * Koyu stil yalnızca varsayılan açık stil kullanılırken devreye girer: NEXT_PUBLIC_MAP_STYLE_URL ile özel bir
 * stil verilmişse onun koyu karşılığı bilinmediğinden her iki temada da aynı stil kullanılır.
 */
export const DEFAULT_MAP_STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
export const DEFAULT_MAP_STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
/** Koyu harita stilini kapatmak için false yapın (her iki temada açık stil). */
export const MAP_DARK_STYLE_ENABLED = true;

export function mapStyleFor(styleUrl: string, theme: "dark" | "light"): string {
  if (theme === "dark" && MAP_DARK_STYLE_ENABLED && styleUrl === DEFAULT_MAP_STYLE_LIGHT) return DEFAULT_MAP_STYLE_DARK;
  return styleUrl;
}
