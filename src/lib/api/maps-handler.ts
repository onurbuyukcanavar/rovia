import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GeoError } from "@/lib/geo-services/errors";
import { isSameOriginRequest, PRIVATE_NO_STORE, readJsonBody } from "./request-guard";

/** Kova adları ve limitleri veritabanında sabittir (migration 20261116000300, 20261120000100). */
type Bucket = "autocomplete" | "route" | "search" | "geocode" | "gps" | "wiki";

/**
 * Yeni kova veritabanına henüz eklenmemişse (migration uygulanmadan yayına çıkıldıysa) kullanılacak eski kova.
 * "place" (60/dk, 1000/gün) artık başka bir uç noktada kullanılmıyor.
 */
const FALLBACK_BUCKET: Partial<Record<Bucket, string>> = { wiki: "place" };
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Harita API uç noktaları için ortak sarmalayıcı:
 * kaynak (CSRF) kontrolü → oturum kontrolü → boyut sınırlı JSON okuma → zod doğrulama →
 * kullanıcı başı hız sınırı (Postgres) → iş mantığı → Türkçe hata. Yanıtlar önbelleğe alınmaz.
 * İş mantığı kullanıcının Supabase istemcisini alır; veritabanı sorguları RLS altında çalışır.
 */
export function mapsHandler<S extends z.ZodType, R>(
  bucket: Bucket,
  schema: S,
  run: (input: z.infer<S>, db: Supabase) => Promise<R>,
  { maxBodyBytes = DEFAULT_MAX_BODY }: { maxBodyBytes?: number } = {},
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      if (!isSameOriginRequest(req)) throw new GeoError("forbidden", `cross-origin ${req.headers.get("origin") ?? "?"}`);
      const db = await createClient();
      const { data: claims } = await db.auth.getClaims();
      if (!claims?.claims?.sub) throw new GeoError("unauthorized");

      const body = await readJsonBody(req, maxBodyBytes);
      if (!body.ok) throw new GeoError(body.reason === "too_large" ? "payload_too_large" : "invalid_request", body.reason);
      const parsed = schema.safeParse(body.data);
      if (!parsed.success) throw new GeoError("invalid_request", z.prettifyError(parsed.error));

      let limit = await db.rpc("consume_rate_limit", { p_bucket: bucket });
      const fallback = FALLBACK_BUCKET[bucket];
      if (limit.error && fallback && /unknown_rate_limit_bucket/.test(limit.error.message)) {
        limit = await db.rpc("consume_rate_limit", { p_bucket: fallback });
      }
      if (limit.error) throw new Error(`rate_limit_rpc: ${limit.error.message}`);
      if (!limit.data) throw new GeoError("rate_limited");

      return NextResponse.json(await run(parsed.data, db), { headers: PRIVATE_NO_STORE });
    } catch (e) {
      const err = e instanceof GeoError ? e : null;
      if (!err || err.status >= 500) {
        console.error(`[rovia] maps ${bucket}:`, err ? `${err.code} ${err.message}` : e);
      }
      const out = err ?? new GeoError("upstream");
      return NextResponse.json({ error: { code: out.code, message: out.userMessage } }, { status: out.status, headers: PRIVATE_NO_STORE });
    }
  };
}

/** Varsayılan JSON gövde sınırı: en büyük meşru istek ~400 KB'lık kodlanmış rota çizgisidir. */
export const DEFAULT_MAX_BODY = 512 * 1024;

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
