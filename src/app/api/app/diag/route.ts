import { isSameOriginRequest, PRIVATE_NO_STORE, readJsonBody } from "@/lib/api/request-guard";

/**
 * Android uygulamasından tanı kaydı (yalnızca yerel Google girişi): hangi adımda, hangi kodla, kaç ms'de bitti.
 * Kişisel veri içermez; alanlar beyaz liste + kısa biçimle sınırlanır. Oturum gerekmez (giriş sayfasında çağrılır).
 */
const CODE = /^[a-z_]{1,32}$/;
let windowStart = 0, count = 0; // örnek başına kaba sınır: dakikada 60 kayıt

export async function POST(req: Request) {
  if (!isSameOriginRequest(req)) return new Response(null, { status: 403, headers: PRIVATE_NO_STORE });
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; count = 0; }
  if (++count > 60) return new Response(null, { status: 204, headers: PRIVATE_NO_STORE });
  const body = await readJsonBody(req, 512);
  if (!body.ok || typeof body.data !== "object" || body.data === null) return new Response(null, { status: 400, headers: PRIVATE_NO_STORE });
  const d = body.data as Record<string, unknown>;
  const step = typeof d.step === "string" && CODE.test(d.step) ? d.step : "unknown";
  const code = typeof d.code === "string" && CODE.test(d.code) ? d.code : "none";
  const ms = typeof d.ms === "number" && Number.isFinite(d.ms) ? Math.max(0, Math.min(600_000, Math.round(d.ms))) : -1;
  const ua = req.headers.get("user-agent") ?? "";
  const ver = /RoviaAndroid\/(\d{1,6})/.exec(ua)?.[1] ?? "?";
  const android = /Android (\d{1,2}(?:\.\d)?)/.exec(ua)?.[1] ?? "?";
  console.warn(`[rovia:tanı] google_native step=${step} code=${code} ms=${ms} app=${ver} android=${android}`);
  return new Response(null, { status: 204, headers: PRIVATE_NO_STORE });
}
