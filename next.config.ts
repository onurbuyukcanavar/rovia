import type { NextConfig } from "next";

import { PUBLIC_EMBEDDABLE_SOURCES, securityHeaders } from "./src/lib/security/headers";

/** Tüm yanıtlara uygulanan güvenlik başlıkları + CSP (gerekçeler: src/lib/security/headers.ts). */
const headers = securityHeaders({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  isDev: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers },
      // Paylaşım önizleme görselleri ve simgeler başka sitelerde gösterilebilir
      ...PUBLIC_EMBEDDABLE_SOURCES.map((source) => ({
        source,
        headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }],
      })),
      // Kişiye özel API yanıtları önbelleğe alınmaz (route handler'lar ayrıca kendi başlığını koyar)
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      // Sürümlü statik dosyalar (yazı tipleri, MapLibre işçisi ?v=sürüm): 1 yıl, değişmez
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/maplibre/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Android App Links doğrulaması (Google girişi dönüşü uygulamaya gelir): JSON, kısa önbellek
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
