import "server-only";
import { autocomplete, reverseGeocode } from "@/lib/geo-services/features";
import { GeoError } from "@/lib/geo-services/errors";
import type { createClient } from "@/lib/supabase/server";
import { parseSharedLocation, type ParsedLocation } from "./parse";
import type { ResolvedLocation } from "./types";
import { ResolveError, resolveShortLink } from "./resolve";

type Supabase = Awaited<ReturnType<typeof createClient>>;


/**
 * Paylaşılan metni konuma çevirir: ayrıştır → (kısa bağlantıysa) yönlendirmeleri izle →
 * (yalnızca ad varsa) ROVIA araması → (ad yoksa) ters adres araması. Ters arama hatası sonucu bozmaz.
 */
export async function resolveSharedLocation(db: Supabase, text: string, labelHint?: string | null): Promise<ResolvedLocation> {
  let parsed: ParsedLocation | null = parseSharedLocation(text, { allowQuery: true });
  if (!parsed) throw new GeoError("not_found", "no location in text");

  if (parsed.kind === "resolve") {
    try {
      parsed = await resolveShortLink(parsed.url);
    } catch (e) {
      const code = e instanceof ResolveError ? e.code : "unresolvable";
      throw new GeoError(code === "timeout" ? "timeout" : code === "invalid_link" ? "invalid_request" : "not_found", `short link: ${code}`);
    }
  }

  if (parsed.kind === "query") {
    const [best] = await autocomplete(db, { text: parsed.query.slice(0, 120) });
    if (!best) throw new GeoError("not_found", "query without match");
    return {
      lat: best.location.lat,
      lng: best.location.lng,
      label: best.name,
      address: best.secondary,
      source: parsed.source,
      approximate: true,
    };
  }

  const label = parsed.label ?? (labelHint?.trim().slice(0, 200) || null);
  let address: string | null = null;
  try {
    address = (await reverseGeocode(db, { lat: parsed.lat, lng: parsed.lng })).label;
  } catch (e) {
    // Yakında yerleşim yoksa (deniz, yurt dışı) ya da servis hatasında yalnızca koordinat gösterilir
    if (!(e instanceof GeoError) || e.status >= 500) console.warn("[rovia] konum ters arama:", e instanceof Error ? e.message : e);
  }
  return { lat: parsed.lat, lng: parsed.lng, label, address, source: parsed.source, approximate: parsed.approximate };
}
