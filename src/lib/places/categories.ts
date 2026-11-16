/**
 * Rota üzerinde aranabilen kategoriler (brief §5.3). `key` veritabanındaki
 * geo_features.category değeriyle aynıdır (scripts/osm/extract.py → POI_RULES).
 */
export const ROUTE_CATEGORIES = [
  { key: "restaurant", label: "Restoranlar", icon: "utensils" },
  { key: "cafe", label: "Kafeler", icon: "coffee" },
  { key: "fuel", label: "Benzin istasyonları", icon: "fuel" },
  { key: "ev", label: "Elektrikli araç şarj", icon: "plug-zap" },
  { key: "hotel", label: "Oteller", icon: "bed-double" },
  { key: "camping", label: "Kamp alanları", icon: "tent" },
  { key: "nature", label: "Doğal güzellikler", icon: "mountain" },
  { key: "historic", label: "Tarihî yerler", icon: "landmark" },
  { key: "museum", label: "Müzeler", icon: "library" },
  { key: "attraction", label: "Turistik noktalar", icon: "camera" },
  { key: "shopping", label: "Alışveriş", icon: "shopping-bag" },
  { key: "rest", label: "Dinlenme tesisleri", icon: "coffee" },
  { key: "health", label: "Hastane ve eczane", icon: "cross" },
] as const;

export type RouteCategoryKey = (typeof ROUTE_CATEGORIES)[number]["key"];
export const ROUTE_CATEGORY_KEYS = ROUTE_CATEGORIES.map((c) => c.key) as [RouteCategoryKey, ...RouteCategoryKey[]];

/** Rota çevresi arama yarıçapı seçenekleri (metre). */
export const RADIUS_OPTIONS = [1_000, 2_000, 5_000, 10_000, 20_000] as const;
