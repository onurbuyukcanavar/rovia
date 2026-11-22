package com.onurbuyukcanavar.rovia;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

/**
 * ROVIA ana etkinliği. Capacitor, uygulama bağlantısıyla (App Link) gelen URL'yi WebView'a
 * kendiliğinden yüklemez; yalnızca eklentilere bildirir. Google girişi sistem tarayıcısında
 * (Custom Tab) yapıldığından dönüş adresi https://www.roviaroad.com/auth/callback?code=…
 * buraya bir VIEW intent'i olarak gelir: aynı sitenin adresiyse WebView'da açılır ve
 * PKCE çerezi WebView'da bulunduğundan oturum orada kurulur.
 * BridgeActivity.load() soğuk açılışta da onNewIntent(getIntent()) çağırır.
 *
 * Paylaşılan konum: geo: / google.navigation: bağlantıları (VIEW) ve paylaş menüsünden gelen metin
 * (SEND text/plain) https://<site>/konum?text=… olarak WebView'da açılır.
 */
public class MainActivity extends BridgeActivity {

    /** Uygulamanın açtığı site; eski Vercel adresi önceki sürümlerle başlatılmış girişler için kabul edilir. */
    static final java.util.Set<String> APP_HOSTS = new java.util.HashSet<>(java.util.Arrays.asList("www.roviaroad.com", "rovia-seven.vercel.app"));

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulama içi güncelleme eklentisi (Capacitor yerel eklentileri bridge kurulmadan kaydedilmeli)
        registerPlugin(RoviaUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        appendVersionToUserAgent();
    }

    /** Web katmanı kurulu sürümü eklenti olmadan da okuyabilsin: mevcut UA + " RoviaAndroid/<versionCode> (<versionName>)" */
    @SuppressWarnings("deprecation")
    private void appendVersionToUserAgent() {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
            android.webkit.WebSettings settings = getBridge().getWebView().getSettings();
            String ua = settings.getUserAgentString();
            if (ua != null && !ua.contains(" RoviaAndroid/")) {
                settings.setUserAgentString(ua + " RoviaAndroid/" + code + " (" + info.versionName + ")");
            }
        } catch (Exception ignored) {
            // Sürüm okunamazsa UA değişmez; eklenti yine sürüm bildirir
        }
    }

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
        if (intent == null) return;
        String target = null;
        if (Intent.ACTION_VIEW.equals(intent.getAction())) {
            Uri uri = intent.getData();
            if (uri == null) return;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
            if ("https".equals(scheme) && APP_HOSTS.contains(uri.getHost())) {
                // Google girişi dönüşü (App Link)
                target = uri.toString();
            } else if ("geo".equals(scheme) || "google.navigation".equals(scheme)) {
                // Konum: geo:41.0,29.0?q=41.0,29.0(Ad) → /konum?text=…
                target = sharedLocationUrl(uri.toString(), null);
            }
        } else if (Intent.ACTION_SEND.equals(intent.getAction()) && intent.getType() != null && intent.getType().startsWith("text/")) {
            // Paylaş menüsü: "Ad\nhttps://maps.app.goo.gl/…" gibi metin
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
            if (text != null && text.length() > 0) target = sharedLocationUrl(text.toString(), subject == null ? null : subject.toString());
        }
        if (target == null) return;
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        final String url = target;
        webView.post(() -> webView.loadUrl(url));
        // Aynı intent yeniden oluşturmada (döndürme vb.) tekrar işlenmesin
        setIntent(new Intent(Intent.ACTION_MAIN));
    }

    /**
     * Paylaşılan konum sayfası: şu an açık olan site (APP_HOSTS içindeyse) ya da www.roviaroad.com.
     * Metin sunucuda ayrıştırılır (src/lib/shared-location); burada yalnızca adres kodlanır ve uzunluk sınırlanır.
     */
    private String sharedLocationUrl(String text, String title) {
        String host = "www.roviaroad.com";
        try {
            WebView webView = getBridge() == null ? null : getBridge().getWebView();
            String current = webView == null ? null : webView.getUrl();
            String currentHost = current == null ? null : Uri.parse(current).getHost();
            if (currentHost != null && APP_HOSTS.contains(currentHost)) host = currentHost;
        } catch (RuntimeException ignored) {
            // WebView henüz hazır değil: varsayılan site
        }
        String body = text.length() > 4000 ? text.substring(0, 4000) : text;
        Uri.Builder b = new Uri.Builder().scheme("https").authority(host).path("/konum").appendQueryParameter("text", body);
        if (title != null && !title.trim().isEmpty() && title.length() <= 200) b.appendQueryParameter("title", title.trim());
        return b.build().toString();
    }
}
