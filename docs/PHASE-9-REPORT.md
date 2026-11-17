# PHASE 9 — Paylaşım ve ek özellikler

## Paylaşım
- Her yolculuk ve seyahatname için: Yalnızca ben (varsayılan) / Bağlantıya sahip olanlar / Herkese açık (arama motorlarına açık).
- İçerik seçimi: rota, istatistikler, duraklar, fotoğraflar, notlar (varsayılan kapalı), seyahatname, ad (varsayılan kapalı), uç noktalar (varsayılan kapalı).
- Gizlilik yarıçapı (0–2 km, varsayılan 500 m): rotanın başlangıç/bitiş çevresi kırpılır; bu çevredeki duraklar, notlar, yazı konumları ve fotoğraflar paylaşılmaz. Başlangıç durağı paylaşılmaz. Fotoğraf konumları hiçbir zaman paylaşılmaz.
- Paylaşım penceresi, kaydedince sunucudan gelen gerçek önizlemeyi gösterir (kaç fotoğraf/durak, kırpılan rota).
- Bağlantı yenileme (eskisi anında geçersiz), gizliye alma, kopyalama, telefon paylaşım menüsü.
- Canlı (aktif) yolculuk paylaşılamaz.
- Güvenlik: paylaşım içeriği yalnızca `share_get()` ile ve yalnızca seçilen alanlarla okunur; tablolara anonim erişim yoktur. Fotoğraflar özel kovada kalır; yalnızca aktif paylaşım kapsamındaki dosyalar için imzalı bağlantı üretilebilir. Uygulamada tam yetkili (service role) anahtar kullanılmaz.

## Paylaşım sayfası ve sosyal kartlar
- `/p/[token]`: oturumsuz, salt okunur sayfa — kapak, istatistikler, rota haritası, duraklar, fotoğraf galerisi, notlar, seyahatname. Bağlantı paylaşımları `noindex`.
- "Bu rotayı planıma kopyala" (görünür duraklar kopyalanır).
- Open Graph/Twitter görseli (1200×630): başlık, rota çizimi, mesafe/süre/tarih.

## GPX/KML ve dışa aktarma
- Yolculuk: GPX 1.1 / KML 2.2 (ham GPS noktaları varsa zaman ve yükseklikle; yoksa sadeleştirilmiş iz; duraklar, konumlu notlar ve yazılar nokta olarak).
- Seyahatname: tek dosya HTML (fotoğraflar gömülü) ve yazı konumları GPX/KML.
- İçe aktarma (`/yolculuklar/ice-aktar`): GPX/KML güvenli ayrıştırma ve doğrulama, harita önizlemesi; zaman damgalı iz → tamamlanmış yolculuk, zamansız iz → planlı rota; mevcut yolculuğa bağlama. Ham noktalar saklanmaz.

## Rota yeniden kullanımı
- "Rotayı tekrar kullan": yolculuğun kopyası yeni plan olarak açılır.

## Testler
- DB: `sharing.test.ts` (8), `track-import.test.ts`. Birim: 333.
- E2E: `share.spec.ts`, `tools.spec.ts`; CI 50/50, yayın kontrolü 19/19.

## Bilinçli sınırlar
- Geçersiz paylaşım bağlantısı dostça sayfa gösterir ancak akış nedeniyle HTTP 200 döner (`noindex`).
- İçe aktarılan rotada en fazla 18 ara durak (planlayıcı sınırı).
- Seyahatname yazılarını içe aktarılan izle eşleştirme ilk sürümde yok.
