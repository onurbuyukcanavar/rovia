import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { fontVariables } from "./fonts";
import { publicEnv } from "@/lib/env";
import { t } from "@/i18n";
import { SwRegister } from "@/components/install/sw-register";
import { ThemeSync } from "@/components/theme/theme-sync";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme/theme";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  metadataBase: publicEnv.siteUrl ? new URL(publicEnv.siteUrl) : undefined,
  title: { default: `${t.brand.name} — ${t.brand.slogan}`, template: `%s · ${t.brand.name}` },
  description: t.marketing.heroBody,
  applicationName: t.brand.name,
  appleWebApp: { capable: true, title: t.brand.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

// theme-color burada değil: <head>'de elle yazılır ve tema betiği tarafından güncellenir (src/lib/theme/theme.ts)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme: betik çalışmadan önceki varsayılan (koyu). Betik ve ThemeSync değiştirir → suppressHydrationWarning
    <html lang="tr" className={fontVariables} data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={THEME_COLOR.dark} />
        {/* Tema: ilk boyamadan önce, eşzamanlı. Sabit dizge; kullanıcı girdisi içermez. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a href="#icerik" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-fg focus:px-4 focus:py-2 focus:text-surface">
          İçeriğe geç
        </a>
        {children}
        <ThemeSync />
        <SwRegister />
        <Analytics />
      </body>
    </html>
  );
}
