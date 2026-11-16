import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { GeoError } from "@/lib/geo-services/errors";

/** Kova adları ve limitleri veritabanında sabittir (migration 20261116000300). */
type Bucket = "autocomplete" | "route" | "search" | "geocode" | "gps";
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Harita API uç noktaları için ortak sarmalayıcı:
 * oturum kontrolü → zod doğrulama → kullanıcı başı hız sınırı (Postgres) → iş mantığı → Türkçe hata.
 * İş mantığı kullanıcının Supabase istemcisini alır; veritabanı sorguları RLS altında çalışır.
 */
export function mapsHandler<S extends z.ZodType, R>(
  bucket: Bucket,
  schema: S,
  run: (input: z.infer<S>, db: Supabase) => Promise<R>,
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const db = await createClient();
      const { data: claims } = await db.auth.getClaims();
      if (!claims?.claims?.sub) throw new GeoError("unauthorized");

      const parsed = schema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) throw new GeoError("invalid_request", z.prettifyError(parsed.error));

      const limit = await db.rpc("consume_rate_limit", { p_bucket: bucket });
      if (limit.error) throw new Error(`rate_limit_rpc: ${limit.error.message}`);
      if (!limit.data) throw new GeoError("rate_limited");

      return NextResponse.json(await run(parsed.data, db));
    } catch (e) {
      const err = e instanceof GeoError ? e : null;
      if (!err || err.status >= 500) {
        console.error(`[rovia] maps ${bucket}:`, err ? `${err.code} ${err.message}` : e);
      }
      const out = err ?? new GeoError("upstream");
      return NextResponse.json({ error: { code: out.code, message: out.userMessage } }, { status: out.status });
    }
  };
}

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
