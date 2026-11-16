# PHASE 3 Raporu — Yolculuk planlama

**Durum:** Tamamlandı ve doğrulandı (16 Kasım 2026)

## Ne teslim edildi

| Brief maddesi | Uygulama |
|---|---|
| Yeni yolculuk oluşturma | `/planla`: yolculuk adı (boşsa "İstanbul – Ankara" gibi önerilen ad), tarih, açıklama |
| Durak ekleme | Arama, haritadan seçme, konumum veya rota üzerinde bulunan yeri "Durak olarak ekle" (en uygun sıraya). En fazla 18 ara durak |
| Durak sıralama ve silme | Yukarı/aşağı taşıma, kaldırma, başlangıç–varış yer değiştirme |
| Rota alternatifleri | Valhalla alternatifleri; seçilen alternatif kaydedilir ve plan yeniden açıldığında korunur |
| Yolculuk kaydetme | Yolculuk, duraklar ve seçili rota tek işlemde kaydedilir (`save_trip_plan`) |

Ek olarak:
- **Yolculuklarım** (`/yolculuklar`): planlanan yolculuklar kart olarak listelenir (tarih, güzergâh, mesafe, süre, durak sayısı). Düzenleme ve iki adımlı silme buradan yapılır.
- **Haritayı Keşfet'ten kaydetme:** çizilen rota "Yolculuk olarak kaydet" ile plana dönüşür.
- **Panel:** etkin hızlı işlemler bağlantı oldu. Yaklaşan yolculuklar planlayıcıyı açar.
- **Veri güvenliği:**
  - Kaydedilmemiş değişiklik varken sekme kapatma ve uygulama içi gezinme onay ister.
  - İki sekmede aynı plan düzenlenirse eski sürüm yenisini sessizce ezmez (`trips.version`, iyimser kilit).
  - Başlamış veya tamamlanmış yolculuğun planı değiştirilemez.
  - Rota servisine ulaşılamazsa kayıtlı rota gösterilir. Rota hiç hesaplanamazsa plan yalnızca duraklarıyla kaydedilir.

## Veritabanı

- `20261116000600_trip_planning.sql`:
  - `trips` tablosuna `version` (her güncellemede tetikleyiciyle artar), `route_legs`, `route_has_toll` ve `route_has_ferry` eklendi.
  - Tutarlılık kısıtları eklendi: rota alanları bir arada, tarih 2000–2100, çizgi boyutu sınırlı.
  - `routing_preference` kaldırıldı (canlı trafik yok).
  - `save_trip_plan()` eklendi: SECURITY INVOKER, yani RLS ve sahiplik tetikleyicisi aynen uygulanır.
- `20261116000700_search_ranking.sql`: yer aramasında tam ad eşleşmesi öne çıkar, aday kümesi sıralı kesilir.
- `20261116000800_trip_plan_errcodes.sql`: hata kodları PostgREST'in HTTP kodlarına (`PT404` / `PT409`) çevrildi.
- Kaydedilen rota çizgisi en fazla 8.000 noktaya sadeleştirilir; tolerans 3 m'den başlar.

## Doğrulama

- **CI, gerçek Supabase + Valhalla + OSM verisiyle: 20/20 E2E geçti.** Yeni planlama testleri:
  1. Ad, tarih ve açıklama girilir; İstanbul → Ankara → Göreme rotası kurulur. Kaydedilmemişken çıkış onay ister. Kaydedilir.
  2. Kayıt listede doğru tarih, durak sayısı ve mesafeyle görünür. Yeniden açılınca tüm alanlar ve aynı rota mesafesi gelir.
  3. Bob, Alice'in planını açamaz.
  4. Ara durak kaldırılıp kaydedilir.
  5. İkinci sekmede değiştirilen plan ilk sekmeden ezilemez (çakışma uyarısı). Plan silinir.
  6. Haritayı Keşfet'ten kaydetme ve ad önerisi; panelde görünme.
  7. Olmayan veya biçimsiz adres "bulunamadı" sayfası gösterir.
- **Birim ve veritabanı testleri: 93.** Bunlara `save_trip_plan` için atomiklik, sürüm çakışması, RLS, geçersiz girdi ve düzenlenemez durum testleri dahildir.
- Test verisi her çalıştırmadan sonra temizlenir (uzak veritabanında 0 yolculuk).
- Supabase güvenlik danışmanında yeni uyarı yok.

## Bulunan ve düzeltilen hatalar

1. **Plan çakışması kaydetmeyi askıda bırakıyordu.**
   - Neden: çakışma `40001` (serialization_failure) koduyla bildiriliyordu. Bu kod "geçici hata, tekrar dene" anlamı taşıyor; istek yanıt vermedi ve kullanıcı "Kaydediliyor…" durumunda kaldı.
   - Çözüm: açık HTTP kodlarına geçildi ve kaydetmeye 15 sn zaman aşımı eklendi. Hata E2E testinde yakalandı.
2. **Yer aramasında "Göreme" yazınca köyün kendisi 3. sıradaydı**, daha "önemli" müze ve parklar öne geçiyordu. Ayrıca geniş sorgularda aday listesi sırasız kesildiği için asıl şehir sonuçlardan düşebiliyordu. İkisi de düzeltildi. "an" sorgusu gerçek veride yaklaşık 40 ms sürüyor.
3. **Dinamik sayfalarda** (`/planla/[id]`) menünün adres okuması derlemeyi kırıyordu. Menüler `Suspense` içine alındı.
4. **Paneldeki hızlı işlem kartları** etkin modüller için de tıklanamıyordu.
5. **Süre biçimi:** 59 dk 59 sn "60 dk", 1 sa 59 dk 59 sn "1 sa 60 dk" görünüyordu.

## Bilinçli sınırlamalar

- Durak sıralama yukarı/aşağı düğmeleriyle yapılıyor. Sürükle-bırak dokunmatikte erişilebilirlik ve hassasiyet sorunları getirdiği için şimdilik eklenmedi.
- "Favorilere ekle", "Daha sonra ziyaret et" ve "Seyahatname kaydı oluştur" yer detayı işlemleri sırasıyla Faz 5 ve Faz 7'de gelecek.
- Tamamlanan (GPS kayıtlı) yolculuklar ve arşiv Faz 4 ve Faz 6'da `/yolculuklar` sayfasına eklenecek.

## Sonraki faz

PHASE 4 — GPS kayıt sistemi: konum takibi, başlat / duraklat / devam / tamamla, canlı rota çizimi, mesafe ve süre. Gerçek cihazda test için HTTPS gerekiyor, yani Vercel önizleme dağıtımı.
