/**
 * Rota üzerinde aranabilen kategoriler (brief §5.3). Her kategori bir veya birden
 * fazla Text Search (New) sorgusuna karşılık gelir; `type` Places API Table A türüdür.
 * Birden fazla sorgu = birden fazla faturalanan istek (hastane+eczane, doğa).
 */
export type CategoryQuery = { text: string; type?: string };
export type RouteCategory = { key: string; label: string; icon: string; queries: CategoryQuery[] };

export const ROUTE_CATEGORIES = [
  { key: "restaurant", label: "Restoranlar", icon: "utensils", queries: [{ text: "restoran", type: "restaurant" }] },
  { key: "cafe", label: "Kafeler", icon: "coffee", queries: [{ text: "kafe", type: "cafe" }] },
  { key: "fuel", label: "Benzin istasyonları", icon: "fuel", queries: [{ text: "benzin istasyonu", type: "gas_station" }] },
  { key: "ev", label: "Elektrikli araç şarj", icon: "plug-zap", queries: [{ text: "elektrikli araç şarj istasyonu", type: "electric_vehicle_charging_station" }] },
  { key: "hotel", label: "Oteller", icon: "bed-double", queries: [{ text: "otel", type: "lodging" }] },
  { key: "camping", label: "Kamp alanları", icon: "tent", queries: [{ text: "kamp alanı", type: "campground" }] },
  { key: "nature", label: "Doğal güzellikler", icon: "mountain", queries: [{ text: "milli park tabiat parkı", type: "national_park" }, { text: "doğa yürüyüşü", type: "hiking_area" }] },
  { key: "historic", label: "Tarihî yerler", icon: "landmark", queries: [{ text: "tarihi yer", type: "historical_landmark" }] },
  { key: "museum", label: "Müzeler", icon: "library", queries: [{ text: "müze", type: "museum" }] },
  { key: "attraction", label: "Turistik noktalar", icon: "camera", queries: [{ text: "gezilecek yer", type: "tourist_attraction" }] },
  { key: "shopping", label: "Alışveriş", icon: "shopping-bag", queries: [{ text: "alışveriş merkezi", type: "shopping_mall" }] },
  { key: "rest", label: "Dinlenme tesisleri", icon: "coffee", queries: [{ text: "dinlenme tesisi", type: "rest_stop" }] },
  { key: "health", label: "Hastane ve eczane", icon: "cross", queries: [{ text: "hastane", type: "hospital" }, { text: "eczane", type: "pharmacy" }] },
] as const satisfies readonly RouteCategory[];

export type RouteCategoryKey = (typeof ROUTE_CATEGORIES)[number]["key"];
export const ROUTE_CATEGORY_KEYS = ROUTE_CATEGORIES.map((c) => c.key) as [RouteCategoryKey, ...RouteCategoryKey[]];
export const categoryByKey = (key: string) => ROUTE_CATEGORIES.find((c) => c.key === key);

/** Rota çevresi arama yarıçapı seçenekleri (metre). */
export const RADIUS_OPTIONS = [1_000, 2_000, 5_000, 10_000, 20_000] as const;
