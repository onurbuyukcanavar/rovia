import { MAX_INPUT } from "./parse";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined)?.trim() || undefined;

/**
 * /konum adres parametrelerinden ayrıştırılacak metin ve ad ipucu.
 *   ?text= / ?url= / ?title=  — Web Share Target (Android Chrome PWA) ve Android uygulaması (SEND, geo:)
 *   ?q=                         — elle ya da bağlantıyla (yer adı da olabilir)
 *   ?lat=&lng=[&label=]         — doğrudan koordinat
 */
export function sharedInputFromParams(params: Params): { text: string; label: string | null } {
  const label = one(params.label) ?? one(params.ad) ?? null;
  const lat = one(params.lat);
  const lng = one(params.lng) ?? one(params.lon);
  if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return { text: `${lat}, ${lng}`, label: label?.slice(0, 200) ?? null };
  }
  const title = one(params.title);
  const parts = [one(params.url), one(params.text), one(params.q), one(params.geo)].filter((s): s is string => !!s);
  // Paylaşım sayfası başlığı tek başına konum taşımaz; ama başka bir şey yoksa (ör. yalnızca yer adı) kullanılır
  if (parts.length === 0 && title) parts.push(title);
  const titleHint = title && !/^(?:https?:|geo:)/i.test(title) && title.length <= 120 && !parts.includes(title) ? title : null;
  return { text: [...new Set(parts)].join("\n").slice(0, MAX_INPUT), label: (label ?? titleHint)?.slice(0, 200) ?? null };
}
