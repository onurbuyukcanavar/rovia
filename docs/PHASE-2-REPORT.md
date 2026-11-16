# PHASE 2 Raporu — Haritayı Keşfet (açık kaynak altyapı)

**Durum:** Tamamlandı ve doğrulandı (16 Kasım 2026)
**Karar:** ADR-001 — Google Maps yerine açık kaynak harita. Google yalnızca OAuth girişi için kullanılıyor.

## Ne teslim edildi

| Özellik | Altyapı | Durum |
|---|---|---|
| İnteraktif harita, tıklayarak nokta seçme, konumum | MapLibre GL JS + OpenFreeMap (Liberty) | ✅ |
| Başlangıç / varış / ara durak (en fazla 18), sürükle-sırala | — | ✅ |
| Rota hesaplama + alternatif rotalar, mesafe/süre, ücretli yol/feribot uyarısı | Valhalla (FOSSGIS sunucusu) | ✅ |
| Yer ve adres arama (yerleşim + ilgi noktası, Türkçe karakter duyarsız) | Kendi PostGIS tablomuz (pg_trgm) + Photon (adres yedeği) | ✅ |
| Rota üzerinde arama (13 kategori, 1–20 km koridor) | `search_features_along_route` (PostGIS) | ✅ |
| Yakınımda arama | `search_features_nearby` | ✅ |
| Yer detayı (OSM etiketleri: telefon, web, açılış saatleri, Vikipedi), sapma süresi önizlemesi | Valhalla | ✅ |
| Rotaya durak olarak ekleme (en uygun sıraya) | `insertionIndexForLegs` | ✅ |
| Ters geokodlama ("Mahalle, İlçe, İl") | `reverse_geocode` | ✅ |
| Kullanıcı başına hız sınırı | `consume_rate_limit` (sabit kova listesi) | ✅ |

## Veri

- Kaynak: Geofabrik `turkey-latest.osm.pbf`, MD5 doğrulamalı. Her ayın 3'ünde GitHub Actions ile otomatik güncellenir (`osm-import.yml`).
- İlk içe aktarma (16.11.2026): **199.144 nesne**, **1.086 il/ilçe sınırı**. Veritabanı boyutu **104 MB** (ücretsiz plan sınırı 500 MB).
  - Yerleşimler: 82 şehir, 930 kasaba, 11.023 mahalle, 37.828 köy.
  - İlgi noktaları: sağlık 30.014, ibadet 22.696, restoran 22.214, alışveriş 17.737, doğa 14.643, benzinlik 12.113, kafe 11.454, konaklama 9.071, tarihî yer 5.064, gezilecek yer 1.209, dinlenme tesisi 805, müze 796, şarj istasyonu 753, kamp 712.
- Lisans: ODbL. Haritada "© OpenStreetMap katkıda bulunanlar" atfı gösteriliyor.

## Doğrulama

- **CI (gerçek Supabase + gerçek Valhalla):** 17/17 E2E testi geçti. Tam akış dahil: İstanbul → Ankara rotası, rota üzerinde benzinlik, detay, sapma, durak ekleme.
- **Birim/veritabanı testleri:** 69 vitest (PGlite + PostGIS ile RLS ve geo fonksiyonları) ve 14 pytest (OSM çıkarımı).
- **Uzak veritabanı örnek sorguları:**
  - "kapadokya" → Kapadokya (Nevşehir)
  - "safranbolu" → Safranbolu (Karabük)
  - (41.0082, 28.9784) → "Alemdar, Fatih, İstanbul"
  - Uçhisar çevresi tarihî yerler → Roma Kalesi, 95 m

## Bulunan ve düzeltilen hatalar

- Mobil "Diğer" testi sayfa geçişinde iki "Genel Bakış" öğesi gördüğü için ara sıra başarısız oluyordu. Test kapsamı daraltıldı.
- `geo_import_runs.data_timestamp` boş kalıyordu, çünkü Geofabrik HEAD yanıtında `Last-Modified` yok. Tarih artık PBF başlığındaki replikasyon zaman damgasından okunuyor (2f22719).

## Bilinçli sınırlamalar (Google'a göre farklar)

- Yer puanı/yorumu ve fotoğraf yok (OSM'de yok). Puan ve fotoğraf ileride kullanıcıların kendi seyahatnamelerinden gelebilir.
- Canlı trafik yok. Süreler yol tipi ve hız sınırına göre tahmin ediliyor.
- Valhalla kamu sunucusu saniyede 1 istekle sınırlı ve ticari garanti vermiyor. **Canlıya çıkmadan önce (PHASE 10)** kendi Valhalla sunucumuzu kurmamız önerilir: Türkiye verisiyle ~5–10 €/ay'lık bir VPS yeterli, kurulum komutu `docs/SETUP.md` §5'te.

## Supabase danışman notları

- `api_rate_limits` politikasız: bilinçli. Tabloya yalnızca SECURITY DEFINER fonksiyon erişiyor.
- `consume_rate_limit` oturum açmış kullanıcıca çağrılabiliyor: bilinçli. Sabit kova listesiyle sınırlı, yalnızca çağıranın sayacını artırıyor.
- **Sızdırılmış şifre koruması kapalı:** Dashboard → Authentication → Sign In / Providers → Email → "Prevent use of leaked passwords" açılmalı. Bu ayar Pro plan gerektirebilir; ücretsiz planda kapalı kalması kabul edilebilir.
- Kullanılmayan indeksler: tablolar henüz boş olduğu için. Bir şey yapmaya gerek yok.

## Sonraki faz

PHASE 3 — Yolculuk planlama ve kaydetme: haritada planlanan rotayı yolculuk olarak kaydetme, kayıtlı yerler, araç bilgisi.
