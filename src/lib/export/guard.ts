import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "./response";
import { t } from "@/i18n";

/** Dışa aktarma uç noktaları: oturum + kimlik doğrulama + 'journal' hız sınırı. Hata varsa yanıt döner. */
export async function exportGuard(id: string): Promise<Response | null> {
  if (!z.uuid().safeParse(id).success) return jsonError(404, t.tools.export.errors.notFound);
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return jsonError(401, t.common.unexpectedError);
  const { data, error } = await db.rpc("consume_rate_limit", { p_bucket: "journal" });
  if (error) throw new Error(`rate_limit_rpc: ${error.message}`);
  if (!data) return jsonError(429, t.tools.export.errors.rateLimited);
  return null;
}
