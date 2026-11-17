/**
 * SSRF savunması: sunucunun indirdiği görseller (HTML dışa aktarma, paylaşım OG görseli) yalnızca
 * yapılandırılmış Supabase projesinin imzalı Storage bağlantıları olabilir. Bağlantılar bugün zaten
 * sunucuda createSignedUrl(s) ile üretiliyor; bu denetim ileride yanlışlıkla kullanıcı verisinden
 * gelen bir adresin iç ağa (ör. 169.254.169.254) istek attırmasını engeller.
 */
export function isProjectSignedStorageUrl(raw: string, supabaseUrl: string | null | undefined): boolean {
  if (!supabaseUrl) return false;
  let url: URL;
  let base: URL;
  try {
    url = new URL(raw);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  if (url.origin !== base.origin) return false;
  if (url.username || url.password) return false;
  // Yerel geliştirmede (http://127.0.0.1:54321) http'ye izin; aksi hâlde yalnızca https
  if (url.protocol !== "https:" && base.protocol !== "http:") return false;
  return /^\/storage\/v1\/(object|render\/image)\/sign\//.test(url.pathname);
}
