package com.onurbuyukcanavar.rovia;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Uygulama içi güncelleme: sürüm bilgisi ve GitHub Releases'ten APK indirip kurulum ekranını açma.
 *
 * Güvenlik:
 * - Yalnızca ROVIA sitesinden (MainActivity.APP_HOSTS) yüklenmiş sayfa çağırabilir.
 * - İndirme yalnızca https ve github.com / GitHub dosya sunucularından; yönlendirmeler elle, her adımda denetlenir.
 * - İndirilen APK'nın paket adı bu uygulamayla aynı, imza sertifikası çalışan uygulamanınkiyle aynı ve
 *   sürüm kodu daha yüksek olmalı; aksi hâlde kurulum ekranı açılmaz ve dosya silinir.
 * - Kurulum Android'in kendi paket yükleyicisindedir (kullanıcı onaylar).
 */
@CapacitorPlugin(name = "RoviaUpdater")
public class RoviaUpdaterPlugin extends Plugin {

    private static final Set<String> DOWNLOAD_HOSTS = new HashSet<>(Arrays.asList(
        "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"));
    private static final int MAX_REDIRECTS = 6;
    private static final long MAX_BYTES = 200L * 1024 * 1024;
    private static final String APK_MIME = "application/vnd.android.package-archive";

    /** "Bilinmeyen uygulamaları yükleme" izni için ayarlara gidildiyse, dönüşte kurulacak dosya */
    private volatile File pendingInstall;
    private volatile boolean busy;

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo info = ownPackage(0);
            JSObject r = new JSObject();
            r.put("versionCode", versionCodeOf(info));
            r.put("versionName", info.versionName);
            r.put("canInstall", Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
            call.resolve(r);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("version_unavailable");
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !isAllowedDownload(url)) {
            call.reject("invalid_url");
            return;
        }
        // WebView.getUrl() yalnızca ana iş parçacığında çağrılabilir: köken denetimi orada, indirme arka planda
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            String current = webView == null ? null : webView.getUrl();
            String host = current == null ? null : Uri.parse(current).getHost();
            if (host == null || !MainActivity.APP_HOSTS.contains(host)) {
                call.reject("forbidden_origin");
                return;
            }
            if (busy) {
                call.reject("busy");
                return;
            }
            busy = true;
            new Thread(() -> {
                try {
                    run(call, url);
                } finally {
                    busy = false;
                }
            }, "rovia-updater").start();
        });
    }

    private void run(PluginCall call, String url) {
        File dir = new File(getContext().getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("storage");
            return;
        }
        File apk = new File(dir, "rovia-update.apk");
        try {
            download(url, apk);
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            call.reject("download_failed", e.getMessage());
            return;
        }
        String problem = verify(apk);
        if (problem != null) {
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            call.reject(problem);
            return;
        }
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // Android 8+: kullanıcı ROVIA'ya "bilinmeyen uygulamaları yükleme" izni vermeli; dönüşte kurulum açılır
            pendingInstall = apk;
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().runOnUiThread(() -> getContext().startActivity(settings));
            r.put("status", "permission");
        } else {
            getActivity().runOnUiThread(() -> launchInstaller(apk));
            r.put("status", "installing");
        }
        call.resolve(r);
    }

    @Override
    protected void handleOnResume() {
        File apk = pendingInstall;
        if (apk == null) return;
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
        pendingInstall = null;
        JSObject e = new JSObject();
        if (allowed && apk.exists()) {
            launchInstaller(apk);
            e.put("status", "installing");
        } else {
            e.put("status", "permission_denied");
        }
        notifyListeners("updateStatus", e);
    }

    private void launchInstaller(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, APK_MIME);
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(install);
    }

    static boolean isAllowedDownload(String url) {
        try {
            URL u = new URL(url);
            return "https".equals(u.getProtocol()) && u.getUserInfo() == null && (u.getPort() == -1 || u.getPort() == 443)
                && DOWNLOAD_HOSTS.contains(u.getHost().toLowerCase(Locale.ROOT));
        } catch (IOException e) {
            return false;
        }
    }

    /** Yönlendirmeleri elle izleyerek indirir (her adım izin listesinde olmalı); ilerleme "updateProgress" olayıyla bildirilir. */
    private void download(String start, File out) throws IOException {
        String current = start;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (!isAllowedDownload(current)) throw new IOException("host_not_allowed");
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("User-Agent", "ROVIA-Android-Updater");
            c.setRequestProperty("Accept", "application/octet-stream");
            try {
                int code = c.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = c.getHeaderField("Location");
                    if (location == null) throw new IOException("redirect_without_location");
                    current = new URL(new URL(current), location).toString();
                    continue;
                }
                if (code != 200) throw new IOException("http_" + code);
                long total = c.getContentLengthLong();
                if (total > MAX_BYTES) throw new IOException("too_large");
                try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                    byte[] buf = new byte[64 * 1024];
                    long done = 0;
                    int lastPercent = -1;
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        done += n;
                        if (done > MAX_BYTES) throw new IOException("too_large");
                        os.write(buf, 0, n);
                        int percent = total > 0 ? (int) (done * 100 / total) : -1;
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            JSObject p = new JSObject();
                            p.put("percent", percent);
                            p.put("bytes", done);
                            notifyListeners("updateProgress", p);
                        }
                    }
                }
                return;
            } finally {
                c.disconnect();
            }
        }
        throw new IOException("too_many_redirects");
    }

    /** null: güvenli; aksi hâlde hata kodu. */
    private String verify(File apk) {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) return "invalid_apk";
        if (!getContext().getPackageName().equals(archive.packageName)) return "wrong_package";
        try {
            PackageInfo own = ownPackage(flags);
            if (versionCodeOf(archive) <= versionCodeOf(own)) return "not_newer";
            Set<String> ownCerts = digests(signaturesOf(own));
            Set<String> newCerts = digests(signaturesOf(archive));
            if (ownCerts.isEmpty() || !ownCerts.equals(newCerts)) return "signature_mismatch";
        } catch (PackageManager.NameNotFoundException e) {
            return "version_unavailable";
        }
        return null;
    }

    private PackageInfo ownPackage(int flags) throws PackageManager.NameNotFoundException {
        return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), flags);
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static Signature[] signaturesOf(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new Signature[0];
            return info.signingInfo.getApkContentsSigners();
        }
        return info.signatures == null ? new Signature[0] : info.signatures;
    }

    private static Set<String> digests(Signature[] sigs) {
        Set<String> out = new HashSet<>();
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            for (Signature s : sigs) {
                byte[] d = md.digest(s.toByteArray());
                StringBuilder sb = new StringBuilder();
                for (byte b : d) sb.append(String.format(Locale.ROOT, "%02x", b));
                out.add(sb.toString());
            }
        } catch (java.security.NoSuchAlgorithmException ignored) {
            // SHA-256 her Android sürümünde vardır
        }
        return out;
    }
}
