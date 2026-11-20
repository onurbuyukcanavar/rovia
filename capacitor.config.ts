import type { CapacitorConfig } from "@capacitor/cli";

/**
 * ROVIA Android kabuğu (Capacitor). Uygulama uzak sunucudan yüklenir: Next.js sitesi sunucu
 * bileşenleri kullandığından statik dışa aktarım yoktur. `mobile/www` yalnızca Capacitor'ın
 * istediği küçük yedek sayfadır (bağlantı yokken gösterilir). Ayrıntılar: docs/ANDROID.md
 */
const config: CapacitorConfig = {
  appId: "com.onurbuyukcanavar.rovia",
  appName: "ROVIA",
  webDir: "mobile/www",
  server: {
    url: "https://rovia-seven.vercel.app",
    androidScheme: "https",
    // Supabase (e-posta doğrulama vb. bağlantılar) WebView içinde açılabilsin.
    // Google girişi WebView'da değil sistem tarayıcısında yapılır (src/lib/native/google-sign-in.ts).
    allowNavigation: ["lbocidoprcqiuxtqhoye.supabase.co"],
    errorPath: "index.html",
  },
  android: {
    // Arka plan konum eklentisi: arka planda 5 dk sonra güncellemelerin durmasını önler
    useLegacyBridge: true,
    backgroundColor: "#0e1726",
  },
};

export default config;
