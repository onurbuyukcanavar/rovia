# PHASE 4 Raporu — GPS kayıt sistemi

**Durum:** Tamamlandı ve doğrulandı (16 Kasım 2026)
**Yayın:** https://rovia-seven.vercel.app (Vercel, fra1). GPS kaydı tarayıcıda HTTPS gerektirdiği için telefon testi bu adresten yapılır.

## Ne teslim edildi

| Brief maddesi | Uygulama |
|---|---|
| GPS konum takibi | `watchPosition` (yüksek doğruluk); izin yalnızca "Kaydı Başlat"a dokununca istenir, konum yalnızca kayıt sürerken alınır |
| Kayıt başlatma | Plansız (yeni yolculuk, ad önerisi) veya planlı yolculuktan (`/kayit-modu?yolculuk=…`, plan rotası haritada kesik çizgi) |
| Duraklatma / devam | Her devam yeni bölüm (segment); duraklatma süresi mesafeye ve hareket süresine eklenmez; durumlar veritabanında |
| Tamamlama | Özet sunucuda, kaydedilmiş noktalardan hesaplanır → `/yolculuklar/[id]` |
| İptal | Kayıt ve tüm noktaları silinir; plansız yolculuk silinir, planlı yolculuk yeniden "Planlandı" olur |
| Rota çizimi | Canlı iz (MapLibre), mevcut konum ve kamera takibi; özette başlangıç/bitiş işaretli harita |
| Mesafe ve süre | Kayıt ekranı: geçen süre, mesafe, ortalama hız, başlangıç saati, mevcut konum (yer adıyla). Özet: toplam mesafe, toplam süre, hareket hâlinde süre, duraklama süresi, ortalama ve en yüksek hız, başlangıç ve bitiş konumu, tarih ve saat |

## Güvenilirlik (brief §6.3–6.4)

- **GPS filtresi** (`src/lib/gps/filter.ts`, canlı ekran ve sunucu özeti aynı kodu kullanır):
  - Doğruluğu 50 m'den kötü, zamanı geriye giden ve fiziksel olarak imkânsız hızla (>252 km/sa) sıçrayan ölçümler atılır.
  - İlk konum hatalıysa, 3 tutarlı ölçümden sonra yeni konuma geçilir; kalıcı kilitlenme olmaz.
  - Mesafe ham noktaların toplamı değildir. Bir çapa noktasından, iki ölçümün doğruluk yarıçapları toplamı kadar uzaklaşınca eklenir; park hâlindeki titreşim kilometre biriktirmez (30 dk park → <60 m).
  - Hareket ve duraklama, cihaz hızına (yoksa çapa ilerleme hızına) göre ayrılır. Ortalama hız hareket süresiyle hesaplanır. Azami hız titreşime dayanıklıdır (~10 sn pencere).
- **Çevrimdışı öncelikli:**
  - Oturum, noktalar ve gönderilmemiş işlemler cihazda (IndexedDB) tutulur. Bağlantı yokken kayıt sürer; bağlantı gelince işlemler sırayla gönderilir.
  - Her işlem idempotenttir: kimlikler istemcide üretilir, tekrar gönderim çift kayıt yaratmaz.
  - Sayfa yenilense ya da tarayıcı kapanıp açılsa kayıt kaldığı yerden devam eder.
  - Başka cihazda süren kayıt bu cihaza alınabilir, tamamlanabilir veya iptal edilebilir.
- **Ekranı açık tutma:** Wake Lock API kullanılıyor; destek yoksa kullanıcı uyarılıyor.
- **Arka plan sınırlamaları:** kayıt ekranında açıkça anlatılıyor. Ekran kapalıyken 90 sn'den uzun kesinti olduysa kullanıcı bilgilendiriliyor. Kesinti, iki ucu arasında düz çizgiyle tamamlanıyor; kesintisiz arka plan takibi vaat edilmiyor.

## Veritabanı ve gizlilik

- `20261116000900_recordings.sql`:
  - Fonksiyonlar: `recording_start`, `recording_add_points`, `recording_pause`, `recording_resume`, `recording_finish`, `recording_cancel`, `recording_track`. Hepsi SECURITY INVOKER (RLS geçerli); hata kodları PT404/PT409.
  - Aynı anda tek aktif kayıt.
  - Zaman damgası doğrulaması: en fazla 30 gün geçmiş, 10 dk gelecek.
  - Nokta ekleme tekrarlara dayanıklı: `(kayıt, zaman)` benzersiz.
- **Saklama stratejisi** (brief §17):
  - Ham GPS noktaları kullanıcının seçtiği süre sonunda silinir: tamamlanınca, 30 gün, 90 gün (varsayılan), 1 yıl veya süresiz.
  - Silme işi `pg_cron` ile saatlik çalışır. Özet, sadeleştirilmiş rota (en fazla 4000 nokta) ve istatistikler kalır.
  - Özet yazılmadan ham veri silinmez.
- Kullanıcı tek bir yolculuğun ham noktalarını veya yolculuğun tamamını silebilir. Saklama süresi Ayarlar → Konum verileri'nden değiştirilir.
- Hız sınırı: `gps` kovası, kullanıcı başı dakikada 60, günde 6000 istek.

## Doğrulama

- **CI, gerçek Supabase ile: 25/25 E2E testi geçti.** Playwright konum simülasyonuyla:
  1. Başlat ve sürüş → mesafe artar, sunucuya gönderilir.
  2. Duraklat → konum değişse de mesafe artmaz.
  3. **Çevrimdışı** devam → "Çevrimdışı" uyarısı, veriler cihazda birikir; bağlantı gelince gönderilir.
  4. **Sayfa yenileme** → kayıt kurtarılır, mesafe aynı.
  5. Tamamla → özet sayfası: ~1 km, süre, hız, nokta sayısı.
  6. "Tamamlanan yolculuklar" listesi → ham noktaları sil (özet kalır) → yolculuğu sil.
  7. Planlı yolculuk başlatma: listede "süren kayıt" uyarısı, plan düzenlenemez; iptal → plan yeniden "Planlandı", iz kalmaz.
  8. İzin reddi → anlaşılır Türkçe yönlendirme.
  9. Senkron API: 401 ve 400.
  10. Ayarlar: saklama süresi kalıcı.
- **Birim ve veritabanı testleri: 122.** GPS filtresi 11, senkron kuyruğu 9, kayıt fonksiyonları 9 (idempotentlik, RLS, iptal ve planlı yolculuk, saklama süresi).
- **Vercel:** üretim dağıtımı READY, çalışma zamanı hatası yok. Güvenlik başlıkları (HSTS, `geolocation=(self)`) doğrulandı.

## Bulunan ve düzeltilen hatalar

- Park hâlindeki GPS titreşimi mesafe biriktiriyordu (eşik tek doğruluk değeriydi). Eşik iki ölçümün doğruluk toplamına çıkarıldı.
- Hız bildirmeyen cihazlarda sürüş hareket sayılmıyordu, titreşim ise azami hızı şişiriyordu. Çapa ilerleme hızı ve 10 sn pencere kullanılıyor.
- İptalden sonra ekranda sunucunun eski "süren kaydın var" bilgisi kalıyordu (E2E'de yakalandı). Düzeltildi.
- Ayarlarda yeni bölümle aynı adlı iki "Kaydet" düğmesi oluşuyordu. Benzersiz ve erişilebilir adlar verildi.
- Ayarlarda "süresiz" (null) saklama süresi 90 gün görünecekti (`??` hatası). Yayından önce düzeltildi.

## Bilinçli sınırlamalar

- Web tarayıcısı ekran kilitliyken konumu garanti etmez. Tam arka plan takibi yerel uygulama gerektirir; Faz 10'da PWA/yerel sarmalayıcı seçenekleri değerlendirilecek.
- Kesinti bölümleri yola oturtulmuyor (map-matching). Kamu Valhalla sunucusunun iz eşleme sınırı (~200 km) uzun yolculuklara yetmiyor; kendi sunucumuzla Faz 10'da eklenebilir.
- Ayrıntılı yolculuk arşivi, filtreler ve istatistikler Faz 6'da.

## Kullanıcının yapması gereken (bir kez)

Supabase → Authentication → URL Configuration:
- **Site URL:** `https://rovia-seven.vercel.app`
- **Redirect URLs:** `https://rovia-seven.vercel.app/**`

Bu yapılmazsa yayındaki sitede e-posta onay bağlantıları ve Google ile giriş yanlış adrese döner. E-posta ve şifreyle giriş yine çalışır.

## Sonraki faz

PHASE 5 — Favoriler ve içe aktarma: favori yönetimi, KML/CSV ve Google Takeout içe aktarma.
