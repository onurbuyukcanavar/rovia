package com.onurbuyukcanavar.rovia;

import android.content.Intent;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * ROVIA ana etkinliği. Capacitor, uygulama bağlantısıyla (App Link) gelen URL'yi WebView'a
 * kendiliğinden yüklemez; yalnızca eklentilere bildirir. Google girişi sistem tarayıcısında
 * (Custom Tab) yapıldığından dönüş adresi https://rovia-seven.vercel.app/auth/callback?code=…
 * buraya bir VIEW intent'i olarak gelir: aynı sitenin adresiyse WebView'da açılır ve
 * PKCE çerezi WebView'da bulunduğundan oturum orada kurulur.
 * BridgeActivity.load() soğuk açılışta da onNewIntent(getIntent()) çağırır.
 */
public class MainActivity extends BridgeActivity {

    private static final String APP_HOST = "rovia-seven.vercel.app";

    /*
     * Oturum çerezlerini diske yaz. Android WebView çerezleri önce bellekte tutar ve diske
     * yalnızca ara sıra (~30 sn) yazar. Uygulama son listeden kaydırılıp kapatılınca son
     * yazılanlar kaybolur: Supabase her yenilemede yeni bir yenileme anahtarı verdiğinden
     * eski (diskteki) anahtar bir sonraki açılışta "zaten kullanılmış" sayılır ve oturum düşer.
     * Uygulama ön plandan her çıktığında çerezleri hemen kalıcı yapmak bunu önler.
     */
    private static void flushCookies() {
        try {
            CookieManager.getInstance().flush();
        } catch (RuntimeException ignored) {
            // WebView sağlayıcısı yoksa/güncelleniyorsa sessizce geç
        }
    }

    @Override
    public void onPause() {
        flushCookies();
        super.onPause();
    }

    @Override
    public void onStop() {
        flushCookies();
        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null || !"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) return;
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        final String url = uri.toString();
        webView.post(() -> webView.loadUrl(url));
        // Aynı intent yeniden oluşturmada (döndürme vb.) tekrar işlenmesin
        setIntent(new Intent(Intent.ACTION_MAIN));
    }
}
