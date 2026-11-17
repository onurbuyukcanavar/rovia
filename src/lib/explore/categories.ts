/** Keşif kategorileri (veritabanındaki explore_features ile aynı anahtarlar). */
export const EXPLORE_CATEGORY_KEYS = [
  "featured", "historic", "ancient", "museum", "mosque", "church", "castle", "park",
  "lake", "waterfall", "mountain", "viewpoint", "village", "gastronomy", "heritage",
] as const;
export type ExploreCategory = (typeof EXPLORE_CATEGORY_KEYS)[number];

export const DEFAULT_CATEGORY: ExploreCategory = "featured";

/** Kategori başına işaret rengi (harita ve listede aynı). */
export const CATEGORY_COLORS: Record<ExploreCategory, string> = {
  featured: "#e8912d",
  historic: "#9a5b2e",
  ancient: "#b4793f",
  museum: "#7c3aed",
  mosque: "#0f766e",
  church: "#4f46e5",
  castle: "#57534e",
  park: "#15803d",
  lake: "#0369a1",
  waterfall: "#0891b2",
  mountain: "#6b4f3a",
  viewpoint: "#c2410c",
  village: "#a16207",
  gastronomy: "#be123c",
  heritage: "#854d0e",
};

export const isExploreCategory = (v: unknown): v is ExploreCategory =>
  typeof v === "string" && (EXPLORE_CATEGORY_KEYS as readonly string[]).includes(v);

/** Sunucudaki alan sınırı (derece²): öne çıkanlar 200, diğerleri 40. */
export const maxAreaFor = (category: ExploreCategory) => (category === "featured" ? 200 : 40);

/** Rota boyunca arama yarıçapı seçenekleri (metre). */
export const RADIUS_OPTIONS = [2_000, 5_000, 10_000] as const;
