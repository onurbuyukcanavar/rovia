import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { MapsError } from "@/lib/google/errors";

type Limits = { bucket: string; perMinute: number; perDay: number };

/**
 * Harita API uç noktaları için ortak sarmalayıcı:
 * oturum kontrolü → kullanıcı başına hız sınırı (Postgres) → zod doğrulama → iş mantığı → Türkçe hata.
 */
export function mapsHandler<S extends z.ZodType, R>(
  limits: Limits,
  schema: S,
  run: (input: z.infer<S>, req: NextRequest) => Promise<R>,
  options: { source: "json" | "query"; respond?: (result: R) => Response } = { source: "json" },
) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const supabase = await createClient();
      const { data: claims } = await supabase.auth.getClaims();
      if (!claims?.claims?.sub) throw new MapsError("unauthorized");

      const raw = options.source === "json" ? await req.json().catch(() => null) : Object.fromEntries(req.nextUrl.searchParams);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new MapsError("invalid_request", z.prettifyError(parsed.error));

      const [minute, day] = await Promise.all([
        supabase.rpc("consume_rate_limit", { p_bucket: `${limits.bucket}:m`, p_limit: limits.perMinute, p_window_seconds: 60 }),
        supabase.rpc("consume_rate_limit", { p_bucket: `${limits.bucket}:d`, p_limit: limits.perDay, p_window_seconds: 86_400 }),
      ]);
      if (minute.error || day.error) throw new Error(`rate_limit_rpc: ${(minute.error ?? day.error)?.message}`);
      if (!minute.data || !day.data) throw new MapsError("rate_limited");

      const result = await run(parsed.data, req);
      return options.respond ? options.respond(result) : NextResponse.json(result);
    } catch (e) {
      const err = e instanceof MapsError ? e : null;
      if (!err || err.status >= 500) {
        // Ham ayrıntı yalnızca sunucu loguna; anahtar hiçbir zaman loglanmaz
        console.error(`[rovia] maps ${limits.bucket}:`, err ? `${err.code} ${err.message}` : e);
      }
      const out = err ?? new MapsError("upstream");
      return NextResponse.json({ error: { code: out.code, message: out.userMessage } }, { status: out.status });
    }
  };
}

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const waypointSchema = z
  .object({
    placeId: z.string().regex(/^[A-Za-z0-9_-]{10,300}$/).optional(),
    location: latLngSchema.optional(),
  })
  .refine((w) => w.placeId || w.location, { error: "placeId veya location gerekli" });
