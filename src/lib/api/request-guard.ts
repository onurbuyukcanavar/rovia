/**
 * Route Handler'lar için istek koruması (CSRF + gövde boyutu). Saf fonksiyonlar: birim testlenebilir.
 *
 * Server Actions'ta Next.js Origin/Host karşılaştırmasını kendisi yapar; Route Handler'larda yapmaz.
 * Oturum çerezi SameSite=Lax olsa da (çapraz siteden POST'ta gönderilmez) aynı sitedeki başka bir alt
 * alan adından gelen isteklere ve tarayıcı farklarına karşı ikinci bir savunma hattı olarak kullanılır.
 */

/** İsteğin geldiği kaynağın (Origin) bu uygulamanın kendisi olup olmadığı. */
export function isSameOriginRequest(req: Request, opts: { allowNavigation?: boolean } = {}): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) {
    if (site === "same-origin") return true;
    // "none": adres çubuğu / yer imi (yalnızca GET indirmeleri için anlamlı)
    if (site === "none" && opts.allowNavigation) return true;
    return false;
  }
  const origin = req.headers.get("origin");
  // Origin ve Sec-Fetch-Site yoksa istek tarayıcıdan gelmiyordur (curl vb.): CSRF söz konusu değil,
  // oturum çerezi de yalnızca tarayıcıda bulunur. Kimlik doğrulama yine ayrıca yapılır.
  if (!origin) return true;
  if (origin === "null") return false;
  return origin === expectedOrigin(req);
}

/** Uygulamanın kendi kaynağı: ters vekil (Vercel) arkasında X-Forwarded-* başlıkları esas alınır. */
function expectedOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = firstValue(req.headers.get("x-forwarded-host")) ?? req.headers.get("host") ?? url.host;
  const proto = firstValue(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

const firstValue = (v: string | null) => v?.split(",")[0]?.trim() || null;

export type JsonBody = { ok: true; data: unknown } | { ok: false; reason: "too_large" | "invalid_json" };

/**
 * JSON gövdeyi en fazla `maxBytes` bayt okuyarak ayrıştırır. Content-Length'e güvenilmez
 * (eksik ya da yanlış olabilir): akış okunurken sınır aşılırsa okuma kesilir.
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<JsonBody> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too_large" };
  if (!req.body) return { ok: false, reason: "invalid_json" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return { ok: true, data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

/** Kişiye özel API yanıtları hiçbir ara katmanda (CDN, tarayıcı) önbelleğe alınmaz. */
export const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
