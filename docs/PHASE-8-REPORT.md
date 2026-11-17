# PHASE 8 — ROVIA Explore ve Garage

## ROVIA Explore (`/kesfet`)
- 14 keşif kategorisi + "Öne çıkanlar": tarihî yapılar, antik kentler, müzeler, camiler, kiliseler, kaleler, doğal parklar, göller, şelaleler, dağlar, manzara noktaları, köyler ve kasabalar, yerel gastronomi, kültürel miras alanları.
- Arama alanı: harita alanı, rota boyunca (kaydedilmiş planlı/aktif yolculuk; 2/5/10 km) veya yakınımda.
- Veri: OpenStreetMap (ODbL). Her yerde kaynak bağlantısı, varsa Wikidata/Wikipedia; topluluk açıklamaları "doğrulanmamış" olarak işaretli. Tarihî bilgi uydurulmaz.
- İşlemler: favorilere ekle, seyahatnameye ekle, yolculuğa ekle (planlayıcıda rotaya en uygun sıraya eklenir, kullanıcı kaydeder) veya yeni plan başlat.
- Önerilen noktalar: planlayıcıdaki rota önerilerinden "Keşfet'te gör" bağlantısı.
- Hız: kategori eşleşmeleri önceden hesaplanır (GIN indeksi); Türkiye geneli sorgu 9,2 sn → 22 ms.
- OSM içe aktarmaya `waterway=waterfall` eklendi; 182 şelale.

## ROVIA Garage (`/garaj`)
- Birden çok araç (en fazla 20), varsayılan araç, marka/model/yıl/yakıt türü/tüketim/depo, tahmini menzil.

## Yolculuk maliyeti
- Planlayıcıda seçili rotanın altında ve aktif/tamamlanmış yolculuk sayfasında maliyet kartı.
- Yakıt: tüketim × mesafe × kullanıcının girdiği fiyat. Fiyat önerilmez; son girilen fiyat tarihiyle hatırlanır, EPDK bağlantısı verilir.
- Köprü/tünel: 1 Temmuz 2026 tarifesi (1. sınıf) referans değer olarak, "yaklaşık" etiketiyle ve değiştirilebilir; 180 günü aşınca uyarı.
- Ücretli otoyol kesimleri (ad ve km) ve feribotlar ayrı kalem; tutarı kullanıcı girer (gişe çiftine göre değiştiği için).
- Yolculuk sayfasında varsayımlar yolculuğa kaydedilir.

## Testler
- DB: `tests/db/explore-garage.test.ts` (5). Birim: 287 (keşif yardımcıları, maliyet motoru, ücret gruplama, Türkçe ondalık).
- E2E: `explore.spec.ts`, `garage.spec.ts`; CI 47/47, yayın kontrolü 17/17 (mobil yerleşimde /kesfet ve /garaj dahil).

## Bilinen sınırlar
- Kaydedilmiş yolculuklarda rota adımları saklanmadığı için ücretli kesimler durak adlarından ve bayraklardan çıkarılır; kullanıcı kalem ekleyebilir.
- Planlayıcıdaki maliyet yolculukla birlikte kaydedilmez (yalnızca son yakıt fiyatı hatırlanır).
