import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/export/response";
import { exportChunks, exportFileName } from "@/lib/account/export";
import { accountExportSources } from "@/lib/account/export-source";
import { t } from "@/i18n";

/**
 * GET /api/account/export — oturumdaki kullanıcının tüm verileri (KVKK m. 11), JSON olarak akış hâlinde.
 * Yalnızca çerez oturumlu istemci (RLS) + sahiplik süzgeci; 'journal' hız sınırı.
 */
export async function GET() {
  // Kullanıcıya özel: önceden oluşturma (prerender) denenmez, istek anında çalışır.
  await connection();
  try {
    const db = await createClient();
    const { data: userData, error: userError } = await db.auth.getUser();
    const user = userData?.user;
    if (userError || !user) return jsonError(401, t.common.unexpectedError);

    const { data: allowed, error: rlError } = await db.rpc("consume_rate_limit", { p_bucket: "export" });
    if (rlError) throw new Error(`rate_limit_rpc: ${rlError.message}`);
    if (!allowed) return jsonError(429, t.account.export.errors.rateLimited);

    const now = new Date();
    const name = exportFileName(now);
    const chunks = exportChunks(
      {
        exportedAt: now,
        account: { id: user.id, email: user.email ?? null, created_at: user.created_at ?? null, last_sign_in_at: user.last_sign_in_at ?? null },
      },
      accountExportSources(db, user.id),
    );
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await chunks.next();
          if (done) controller.close();
          else controller.enqueue(encoder.encode(value));
        } catch (e) {
          // Yarım dosya geçerli JSON değildir; akış hatayla kesilir, tarayıcı indirmeyi başarısız sayar.
          console.error("[rovia] account export:", e instanceof Error ? e.message : e);
          controller.error(e);
        }
      },
      async cancel() {
        await chunks.return(undefined);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error("[rovia] account export:", e instanceof Error ? e.message : e);
    return jsonError(500, t.common.unexpectedError);
  }
}
