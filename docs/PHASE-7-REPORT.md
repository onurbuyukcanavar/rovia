# PHASE 7 — ROVIA Journal (dijital seyahatname)

## Neler yapıldı
- **Seyahatname** (`/seyahatnameler`): yolculuktan veya bağımsız oluşturma; yolculuğun günlük notları isteğe bağlı olarak yazı taslağına aktarılır (fotoğraflar kopyalanmaz, aynı medya kaydı bağlanır).
- **Çalışma alanı** (`/seyahatnameler/[id]`): kapak bilgileri (başlık, alt başlık, amaç, genel açıklama, kapak fotoğrafı, taslak/yayımlandı), bölümler (sıralama, gizleme, yeniden adlandırma, özel bölüm ekleme/silme, metin bölümlerinde zengin editör), yazılar (kronolojik / elle sıralı), harita ile çift yönlü bağlantı.
- **Yazı düzenleyici** (`/yazi/[entryId]`): başlık, tür, ziyaret zamanı (yazım zamanından bağımsız), konum (arama / haritaya tıklama), etiketler, Anlatı + İlk izlenim + Tarihçe + Kişisel değerlendirme, yazıya özel açıklamalı ve sıralanabilir fotoğraflar, önceki sürümler.
- **Zengin metin editörü** (TipTap): başlık/alt başlık, kalın, italik, altı çizili, alıntı, listeler, bağlantı (yalnızca http/https/mailto), ayraç, açıklamalı görsel. İçerik sunucuda izinli düğüm listesine göre temizlenir; HTML olarak saklanmaz ve gösterilmez.
- **Otomatik kayıt**: sürüm denetimli (başka sekme/cihaz çakışmasında uyarı), kaydedilmemiş değişiklikler cihazda yedeklenir, çevrimdışı bekler, geçici hatada yeniden dener, çıkışta uyarır. 15 dakikada bir yazı geçmişi (yazı başına 50).
- **Seyahatnameye ekle**: harita yer paneli, favoriler, konumlu günlük notları, yolculuk sayfası.
- **Kitap görünümü** (`/oku`) ve **PDF**: kapak, logo, rota, tarih, harita görseli, bölümler, kronolojik anlatı, keşfedilen noktalar, fotoğraf galerisi, sayfa numaraları; Türkçe karakterler gömülü yazı tipleriyle (Newsreader, Manrope — OFL). PDF tarayıcıda üretilir (sunucu maliyeti yok).

## Güvenlik
- Tüm fonksiyonlar SECURITY INVOKER; RLS ve sahiplik tetikleyicileri geçerli. Başkasının fotoğrafı kapak/yazı fotoğrafı yapılamaz.
- Yazı yamalarında izinli alan listesi; boyut sınırları (alan başına ~400 KB, yazı başına ~1,2 MB).
- Hız sınırı kovası `travelogue`: 120/dk, 6000/gün.

## Testler
- DB/RLS: `tests/db/travelogues.test.ts` (11). Birim: editör belgesi, otomatik kayıt çekirdeği, PDF modeli, tarih dönüşümü (toplam 230).
- E2E `e2e/travelogue.spec.ts` (gerçek Supabase): oluştur → kapak → özel bölüm → yazı (kalın metin, etiket, konum, fotoğraf) → yeniden yükle → oku → PDF indir (~268 KB) → sil. CI 43/43, yayın kontrolü 17/17.

## Bulunan ve düzeltilen hata
Next 16 önceki sayfayı gizli (Activity) tutuyor; gezinmeden önce açık kalan modal `<dialog>` yeni sayfayı etkileşimsiz bırakıyordu. Modal artık gizlenince kapanıyor.

## Sonraki fazlara kalanlar
- Yapay zekâ yazı desteği (spec'te isteğe bağlı; veri modelinde `ai_assisted` alanı hazır).
- Paylaşım bağlantısı ve HTML/DOCX dışa aktarma → PHASE 9.
