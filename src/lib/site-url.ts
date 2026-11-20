import "server-only";
import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { pickSiteOrigin } from "@/lib/site-origin";

/**
 * OAuth ve e-posta yönlendirmeleri için güvenilir site kökü.
 * Üretimde NEXT_PUBLIC_SITE_URL zorunludur; istek bilinen bir ROVIA adresinden (site-origin.ts)
 * geliyorsa o adres kullanılır, aksi hâlde birincil adres (Host başlığı sahteciliğine karşı);
 * geliştirmede istek başlıklarından türetilir.
 */
export async function getSiteUrl(): Promise<string> {
  if (publicEnv.siteUrl) {
    const h = await headers();
    return pickSiteOrigin(publicEnv.siteUrl, h.get("x-forwarded-host") ?? h.get("host"));
  }
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
