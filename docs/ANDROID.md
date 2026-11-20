# ROVIA Android uygulaması (APK)

ROVIA'nın Android uygulaması, siteyi (https://www.roviaroad.com) yerel bir kabukta açan bir
[Capacitor 8](https://capacitorjs.com) uygulamasıdır. Asıl yerel katkısı: **ekran kapalıyken ya da
uygulama arka plandayken de süren GPS yolculuk kaydı.**

**İndirme (her zaman en yeni sürüm):**
https://github.com/onurbuyukcanavar/rovia/releases/latest/download/rovia.apk

## Sahibin yapması gereken TEK adım

GitHub deposunda imza parolasını gizli değişken olarak ekleyin:

1. GitHub → depo → **Settings → Secrets and variables → Actions → New repository secret**
2. Ad: `ANDROID_KEYSTORE_PASSWORD`, değer: sürüm anahtarının parolası (anahtar ve şifreli dosya için aynı parola).
3. **Actions → Android APK → Run workflow** ile ilk derlemeyi başlatın (sonrakiler otomatik).

Parola yoksa iş akışı en başta Türkçe bir hatayla durur. Parola kaybolursa aynı imzayla güncelleme
yayımlanamaz (bkz. Sınırlamalar).

## Nasıl derlenir, imzalanır, yayımlanır

`.github/workflows/android.yml` şu durumlarda çalışır: elle (workflow_dispatch) ya da `main` dalına
`android/**`, `capacitor.config.ts`, `mobile/**`, `android-signing/**`, iş akışı dosyası veya
`package.json` değişikliği gönderildiğinde.

1. `npm ci`, Java 21 (Temurin), Android SDK kurulur; `npx cap sync android` eklentileri ve yapılandırmayı eşitler.
2. `android-signing/release.jks.enc` (AES-256-CBC, PBKDF2 600 000 tur) `ANDROID_KEYSTORE_PASSWORD` ile
   geçici klasöre çözülür. Anahtar adı (alias) `rovia`, anahtar parolası = depo parolası.
3. `./gradlew assembleRelease`: imza bilgileri yalnızca ortam değişkenlerinden okunur
   (`android/app/build.gradle`); depoda parola yoktur. `versionCode` = iş akışı çalıştırma numarası,
   `versionName` = `1.0.<numara>`.
4. `apksigner` ile imza doğrulanır; sertifika SHA-256 parmak izi
   `9A:0A:D5:…:8F:DC` değilse iş durur (App Links ve güncellemeler bu ize bağlıdır).
5. APK artefakt olarak yüklenir ve `android-v1.0.<numara>` etiketli, "latest" işaretli bir GitHub
   Release'e **`rovia.apk`** adıyla eklenir. Böylece yukarıdaki sabit bağlantı hep en yeniyi indirir.
6. Çözülmüş anahtar her durumda silinir.

Yerelde: `npm run cap:sync` ardından `cd android && ./gradlew assembleDebug` (Android SDK gerekir).

## Kurulum

1. Telefonda yukarıdaki bağlantıyı açın, `rovia.apk` inin.
2. Android "bilinmeyen uygulamalar" uyarısı verirse: **Ayarlar → Uygulamalar → (tarayıcınız) →
   Bilinmeyen uygulamaları yükle → İzin ver**. Sonra indirilen dosyayı açıp **Yükle**'ye dokunun.
3. Play Protect "tanınmayan geliştirici" diyebilir: **Yine de yükle**.
4. İlk kayıtta konum izni ("Uygulamayı kullanırken" yeterli) ve Android 13+'ta bildirim izni verin.

## Güncellemeler

Uygulama içeriği (sayfalar, özellikler) sunucudan geldiği için site her yayımlandığında uygulama da
güncellenir; APK'yı yeniden kurmak gerekmez. Yalnızca yerel kabuk değiştiğinde (eklenti, izin, simge)
yeni APK çıkar: aynı bağlantıdan indirip üzerine kurmak yeterlidir — imza aynı olduğu için veriler
korunur. Otomatik güncelleme yoktur.

## Uygulamada nasıl çalışır

- **Arka planda GPS:** `src/lib/gps/use-recorder.ts`, `isNativeApp()` doğruysa tarayıcı
  `watchPosition` yerine `@capacitor-community/background-geolocation` eklentisini kullanır
  (`src/lib/native/background-geolocation.ts`). Kayıt sürerken "ROVIA yolculuğu kaydediyor"
  bildirimiyle bir ön plan hizmeti çalışır; ekran kapansa da noktalar gelir, cihazdaki IndexedDB'ye
  yazılır ve bağlantı oldukça gönderilir. Duraklat/bitir ile hizmet kapanır. İzin reddinde
  Türkçe hata ve "Ayarları aç" önerisi gösterilir. `android.useLegacyBridge` açık (eklentinin 5 dk
  sonra durma sorunu için). Tarayıcıdaki web yolu değişmedi; eklenti kodu tarayıcı paketine girmez
  (dinamik içe aktarma).
- **Google ile giriş:** Google, WebView içinde OAuth'u engeller (`disallowed_useragent`). Uygulamada
  Google düğmesi (`src/lib/native/google-sign-in-form.tsx`) sunucu eyleminden OAuth adresini alır
  (`googleSignInUrlForNative`; PKCE çerezi bu sırada WebView'a yazılır) ve adresi sistem tarayıcısında
  (Custom Tab, `@capacitor/browser`) açar. Google'dan dönüş
  `https://www.roviaroad.com/auth/callback` adresine olur; bu adres Android App Link olarak
  uygulamaya bağlıdır (`AndroidManifest.xml`, `autoVerify`). `MainActivity` gelen adresi WebView'da
  açar, oturum WebView'da kurulur. E-posta/parola girişi değişmedi.
- **App Link doğrulaması:** `public/.well-known/assetlinks.json` (paket `com.onurbuyukcanavar.rovia`,
  yukarıdaki parmak izi). `src/proxy.ts` bu yolu oturum yönlendirmesinden muaf tutar;
  `next.config.ts` `application/json` başlığı ve kısa önbellek verir.
- Bağlantı yokken `mobile/www/index.html` ("Bağlantı kurulamadı") gösterilir.

## Sınırlamalar

- Yalnızca Android; Play Store'da değil (elle kurulum, otomatik güncelleme yok).
- Uygulama çevrimiçi çalışır: sayfalar sunucudan yüklenir. Kayıt sırasında bağlantı kopsa da
  noktalar cihazda saklanır; ancak uygulamayı bağlantısızken sıfırdan açmak yedek sayfayı gösterir.
- Arka planda Android, WebView ağ isteklerini kısabilir: noktalar kaybolmaz, uygulama öne gelince
  gönderilir. Bazı üreticiler (Xiaomi, Huawei, Samsung pil tasarrufu) arka plan hizmetlerini
  kapatabilir: ROVIA için pil optimizasyonunu kapatmak önerilir.
- Bildirim izni (Android 13+) verilmezse kayıt sürer ama bildirim görünmeyebilir.
- App Link doğrulanmamışsa (ör. `assetlinks.json` henüz yayında değil) Google dönüşü tarayıcıda
  açılır ve giriş tamamlanmaz; o durumda e-posta/parola ile girin.
- İmza anahtarı veya parolası kaybolursa yeni APK eskisinin üzerine kurulamaz; kullanıcıların
  kaldırıp yeniden kurması ve `assetlinks.json`'ın güncellenmesi gerekir.
