/**
 * ROVIA'nın yayında olduğu kökler. Birincil adres NEXT_PUBLIC_SITE_URL'dir; eski Vercel adresi,
 * önceki Android sürümleri ve eski bağlantılar çalışmaya devam etsin diye hâlâ kabul edilir.
 */
export const KNOWN_SITE_ORIGINS = ["https://www.roviaroad.com", "https://rovia-seven.vercel.app"] as const;

/**
 * OAuth/e-posta dönüş adresi için kök seçer: isteğin geldiği alan adı bilinen kökler arasındaysa o
 * (giriş hangi adreste başladıysa oraya dönülmeli; PKCE çerezi o alan adındadır), değilse birincil.
 * Host başlığı yalnızca izin listesiyle karşılaştırılır; sahte Host başka bir köke yönlendiremez.
 */
export function pickSiteOrigin(primary: string, host: string | null | undefined, extra: readonly string[] = KNOWN_SITE_ORIGINS): string {
  const base = primary.replace(/\/$/, "");
  if (!host) return base;
  const candidate = `https://${host.trim().toLowerCase()}`;
  const allowed = new Set([base, ...extra].map((o) => o.replace(/\/$/, "").toLowerCase()));
  return allowed.has(candidate) ? candidate : base;
}
