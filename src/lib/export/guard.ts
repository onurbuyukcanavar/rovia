import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "./response";
import { isSameOriginRequest } from "@/lib/api/request-guard";
import { t } from "@/i18n";

/** Dışa aktarma uç noktaları: kaynak (CSRF) + oturum + kimlik doğrulama + 'journal' hız sınırı. Hata varsa yanıt döner. */
export async function exportGuard(req: Request, id: string): Promise<Response | null> {
  // Başka bir siteden tetiklenen indirmeler reddedilir (adres çubuğu / yer imi serbest)
  if (!isSameOriginRequest(req, { allowNavigation: true })) return jsonError(403, t.common.forbidden);
  if (!z.uuid().safeParse(id).success) return jsonError(404, t.tools.export.errors.notFound);
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return jsonError(401, t.common.unauthorized);
  const { data, error } = await db.rpc("consume_rate_limit", { p_bucket: "journal" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  if (!data) return jsonError(429, t.tools.export.errors.rateLimited);
  return null;
}
