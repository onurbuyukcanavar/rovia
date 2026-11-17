import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadShare, TOKEN_RE } from "@/lib/share/server";
import { buildShareView, projectRoute } from "@/lib/share/view";
import { t } from "@/i18n";
import { getSupabaseConfig } from "@/lib/env";
import { isProjectSignedStorageUrl } from "@/lib/security/storage-url";

export const alt = t.share.page.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MAX_BG_BYTES = 2 * 1024 * 1024;
const ROUTE_BOX = { width: 440, height: 440, padding: 24 };

const fonts = Promise.all([
  readFile(join(process.cwd(), "public/fonts/Manrope_700Bold.ttf")),
  readFile(join(process.cwd(), "public/fonts/Newsreader_600SemiBold.ttf")),
]);

/** Kapak fotoğrafını data URL olarak gömer; 2 MB'tan büyükse ya da alınamazsa atlanır. */
async function backgroundDataUrl(urls: (string | null | undefined)[]): Promise<string | null> {
  for (const url of urls) {
    // Yalnızca kendi Supabase projemizin imzalı bağlantıları (SSRF koruması); yönlendirme izlenmez
    if (!url || !isProjectSignedStorageUrl(url, getSupabaseConfig()?.url)) continue;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!res.ok) continue;
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BG_BYTES) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_BG_BYTES) continue;
      const type = res.headers.get("content-type") ?? "image/jpeg";
      if (!/^image\/(jpeg|png|webp|gif)/.test(type)) continue;
      return `data:${type};base64,${buf.toString("base64")}`;
    } catch {
      // Arka plan isteğe bağlı
    }
  }
  return null;
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [manrope, newsreader] = await fonts;
  const loaded = TOKEN_RE.test(token) ? await loadShare(token).catch(() => null) : null;
  const view = loaded ? buildShareView(loaded.payload, new Map(Object.entries(loaded.signed))) : null;

  let bg: string | null = null;
  if (loaded && view?.coverUrl) {
    const cover = loaded.payload.travelogue?.cover ?? loaded.payload.trip?.photos?.[0] ?? null;
    const thumb = cover?.thumb ? loaded.signed[cover.thumb] : null;
    bg = await backgroundDataUrl([view.coverUrl, thumb]);
  }
  const d = view ? projectRoute(view.paths, ROUTE_BOX) : "";
  const title = view?.title ?? t.share.page.unavailableTitle;
  const chips = view ? [...view.chips.slice(0, 2).map((c) => c.value), ...(view.dateRange ? [view.dateRange] : [])] : [];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#0e1726", color: "#f7f5f0", fontFamily: "Manrope" }}>
        {bg && (
          <img src={bg} alt="" width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }} />
        )}
        <div style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, display: "flex",
          background: bg ? "linear-gradient(90deg, rgba(14,23,38,0.94) 0%, rgba(14,23,38,0.78) 55%, rgba(14,23,38,0.45) 100%)" : "linear-gradient(135deg, #0e1726 0%, #1c2a40 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", width: d ? 700 : 1100, height: 630, padding: "56px 0 56px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="52" height="52" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill="#f7f5f0" />
              <path d="M17 48c0-9 7.5-11 14.5-12.5S44 31 44 24.5 38 17 31.5 18" fill="none" stroke="#0e1726" strokeWidth="5.5" strokeLinecap="round" />
              <circle cx="44.5" cy="17.5" r="5.2" fill="#e8912d" />
            </svg>
            <span style={{ fontSize: 30, letterSpacing: 9, fontWeight: 700 }}>ROVIA</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {view?.ownerName && <span style={{ fontSize: 26, color: "#e8912d" }}>{t.share.page.by(view.ownerName)}</span>}
            <span style={{ fontFamily: "Newsreader", fontSize: title.length > 40 ? 58 : 72, lineHeight: 1.08, display: "flex" }}>
              {title.length > 90 ? `${title.slice(0, 88)}…` : title}
            </span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {chips.map((c) => (
              <span key={c} style={{ display: "flex", fontSize: 26, padding: "10px 22px", borderRadius: 999, background: "rgba(247,245,240,0.14)", border: "1px solid rgba(247,245,240,0.25)" }}>
                {c}
              </span>
            ))}
          </div>
        </div>
        {d && (
          <div style={{ position: "absolute", right: 56, top: 95, width: ROUTE_BOX.width, height: ROUTE_BOX.height, display: "flex" }}>
            <svg width={ROUTE_BOX.width} height={ROUTE_BOX.height} viewBox={`0 0 ${ROUTE_BOX.width} ${ROUTE_BOX.height}`}>
              <path d={d} fill="none" stroke="rgba(14,23,38,0.6)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="#f7f5f0" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke="#e8912d" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Manrope", data: manrope, weight: 700, style: "normal" },
        { name: "Newsreader", data: newsreader, weight: 600, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60" },
    },
  );
}
