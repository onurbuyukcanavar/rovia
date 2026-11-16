import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { publicEnv } from "@/lib/env";
import { t } from "@/i18n";

export const metadata: Metadata = {
  metadataBase: publicEnv.siteUrl ? new URL(publicEnv.siteUrl) : undefined,
  title: { default: `${t.brand.name} — ${t.brand.slogan}`, template: `%s · ${t.brand.name}` },
  description: t.marketing.heroBody,
  applicationName: t.brand.name,
  appleWebApp: { capable: true, title: t.brand.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0e1726",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-paper">
          İçeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
