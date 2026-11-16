# PHASE 6 Raporu — Yolculuk arşivi ve seyahat günlüğü

**Durum:** Tamamlandı (16 Kasım 2026)
**Yayın:** https://rovia-seven.vercel.app/yolculuklar · https://rovia-seven.vercel.app/gunluk

## Ne teslim edildi

| Brief maddesi | Uygulama |
|---|---|
| Geçmiş yolculuklar (§8) | `/yolculuklar` arşivi. Her kartta ad, tarih, başlangıç → varış, mesafe, süre, rota önizlemesi, kapak fotoğrafı, fotoğraf ve not sayısı |
| Sıralama (§8) | Tarihe (yeni/eski), mesafeye (uzun/kısa) ve ada göre (Türkçe alfabe). Ad, yer ve açıklamada arama |
| Aç / düzenle / sil (§8) | Detay sayfası. Ad ve açıklama düzenlenir. Silerken "notları ve fotoğrafları da sil" seçeneği var; seçilmezse günlük yolculuksuz olarak korunur |
| Fotoğraf yükleme (§10) | Çoklu seçim veya sürükle-bırak, her seferde en fazla 20 fotoğraf. İlerleme ve hata ayrıntısı gösterilir |
| Kısa not, başlık, anı, ziyaret edilen yerler (§10) | Not türleri: Not / Anı / Ziyaret edilen yer. Başlık, metin, tarih-saat, yer araması ve fotoğraf seçimi; düzenleme ve silme |
| Görsel seyahat günlüğü (§10) | Yolculuk sayfasında günlere bölünmüş zaman çizelgesi ve galeri. `/gunluk`'ta tüm notlar ve fotoğraflar, yolculuğa göre süzülebilir. Tam ekran görüntüleyici: kaydırma, ok tuşları, çekim zamanı ve konumu, açıklama, silme |
| Fotoğraf–yolculuk ilişkisi (§10) | Her fotoğraf yolculuğa bağlanır. Konumu olan fotoğraf ve notlar yolculuk haritasında işaretlenir |
| Ortak medya kaydı (§10) | Fotoğraf `media_assets`'te bir kez durur; notlar `journal_note_media` ile bağlanır. PHASE 7 seyahatnameleri aynı kaydı kullanacak, yeniden yükleme olmayacak |

## Fotoğrafların güvenliği ve gizliliği

- **Cihazda işleme:**
  - Fotoğraf yüklenmeden önce tarayıcıda yeniden çizilir: en fazla 2560 px büyük görsel ve 480 px küçük görsel. WebP olarak kodlanır, WebP kodlanamıyorsa JPEG.
  - Böylece dosyadaki **tüm EXIF bilgisi silinir**: GPS, cihaz modeli, seri numarası. İleride paylaşılan bir fotoğraf ev konumunu sızdıramaz.
  - Telefon fotoğraflarının yönü (dikey/yatay) korunur.
- **Çekim bilgisi:** Çekim zamanı ve konumu silinmeden önce okunur. Yalnızca kullanıcının kendi özel kaydına yazılır; arşivde sıralama ve harita işareti için kullanılır.
- **Depolama:**
  - Fotoğraflar özel `media` kovasında, `{kullanıcı}/{rastgele-uuid}.webp` yolunda tutulur.
  - Kova kuralı kullanıcının yalnızca kendi klasörünü okumasına, yazmasına ve silmesine izin verir.
  - Fotoğraflar 1 saatlik imzalı bağlantılarla gösterilir; herkese açık bağlantı yok.
- **Kayıt doğrulaması (`media_register`):**
  - Dosyanın gerçekten yüklendiği, türü (yalnızca WebP/JPEG) ve boyutu Storage kaydından kontrol edilir; istemcinin bildirdiğine güvenilmez.
  - Yol biçimi ve sahibi doğrulanır.
  - Kullanıcı başına kota: **300 MB / 3000 fotoğraf**. Ücretsiz Supabase planının toplam 1 GB depolama sınırı düşünülerek konuldu.
- **Silme:** Fotoğraf, not veya yolculuk silinince Storage'daki dosyalar da silinir.
- **Hız sınırı:** `media` kovası dakikada 30 / günde 400 kayıt; `journal` kovası dakikada 60 / günde 1000 işlem.

## Veritabanı

**Migration:** `20261116001100_journal.sql` (canlıya uygulandı; Supabase güvenlik denetiminde yeni bulgu yok).

| Fonksiyon | Görevi |
|---|---|
| `media_register` | Yüklenen dosyayı kaydeder: yol, sahiplik, tür, boyut ve kota doğrulaması |
| `media_delete` | Fotoğrafları siler, silinecek dosya yollarını döndürür |
| `journal_note_save` | Notu ve fotoğraf bağlantılarını tek işlemde kaydeder; nota bağlanan fotoğrafı notun yolculuğuna bağlar |
| `trip_archive` | Arşiv listesini özet, rota, sayılar ve kapak fotoğrafıyla döndürür |
| `trip_delete` | Yolculuğu, isteğe bağlı olarak günlüğüyle birlikte siler |

- Hepsi SECURITY INVOKER: RLS geçerli.
- Notlardaki "başlık veya metin zorunlu" kısıtı, yalnızca fotoğraftan oluşan not yazılabilsin diye `journal_note_save`'e taşındı. Kural artık: başlık, metin veya en az bir fotoğraf.

## Testler

- **Veritabanı (PGlite):** 9 yeni test. Kapsam:
  - dosya doğrulaması: yüklenmemiş dosya, başkasının klasörü, yol hilesi, PNG
  - kota aşımında işlemin tamamen geri alınması
  - not ve fotoğraf bağlantıları, sıralama, düzenleme
  - başkasının notu, fotoğrafı ve yolculuğu
  - arşiv sayıları ve kapak
  - silme senaryoları
  - Toplam veritabanı testi: 64.
- **Birim:** rota önizlemesi (2 test). Toplam birim ve veritabanı testi: 163.
- **E2E (`e2e/journal.spec.ts`, gerçek Supabase):** iki yolculuk oluşturma, ardından:
  - arşivde arama ve sıralama; ad ve açıklama düzenleme
  - EXIF'li gerçek fotoğraf yükleme. Doğrulananlar: boyut 2560 px, WebP, **dosyada EXIF ve cihaz adı yok**, konum ve zaman veritabanında, harita işareti var.
  - başka kullanıcı dosyayı indiremiyor ve imzalı bağlantı alamıyor
  - görüntüleyicide açıklama; fotoğraflı ziyaret notu ve düzenleme; arşiv kartı sayıları
  - Seyahat Günlüğüm'de süzme, yeni anı ve silme
  - yolculuğu günlüğüyle silme: kayıtlar ve **Storage dosyaları** siliniyor
- **Mobil:** `/gunluk` mobil yerleşim testine eklendi.
- **Testin yakaladığı hata:** EXIF okumada belirli etiketler seçilince GPS konumu hiç okunmuyordu. Gerçek EXIF'li test fotoğrafıyla bulundu ve düzeltildi.

## Bilinen sınırlar

- **HEIC:**
  - iPhone, fotoğraf seçicide fotoğrafları genellikle JPEG'e çevirerek verir; Safari HEIC'i de açabilir.
  - HEIC'i açamayan bir tarayıcıda (ör. bazı Android/Windows Chrome sürümleri) kullanıcı anlaşılır bir hata görür.
- **Yarım kalan yükleme:** Dosya yüklenip kayıt adımında bağlantı koparsa uygulama dosyayı geri silmeye çalışır. Tarayıcı tam o anda kapanırsa Storage'da sahipsiz bir dosya kalabilir. Bu tür dosyaların toplu temizliği PHASE 10'daki bakım işlerine eklenecek.
- **Seyahatname bağlantısı:** "İlgili seyahatname kayıtları" PHASE 7'de (ROVIA Journal) yolculuk sayfasına bağlanacak. Sayfada bunu belirten bir not var.
