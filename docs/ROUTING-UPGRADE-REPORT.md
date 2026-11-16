# Rota geliştirmesi (PHASE 6 → 7 arası)

**Durum:** Tamamlandı (16 Kasım 2026)
**Talep:** Google Maps'teki rota seçenekleri, rota üzerinde önerilen yerler, Eskihisar–Topçular arabalı vapurunun rotaya alınmaması.

## Tanı: feribot neden rotaya girmiyordu?

FOSSGIS Valhalla sunucusuna (sürüm 3.9.2) GitHub Actions üzerinden doğrudan istekler atıldı. Bulgular:

- Eskihisar–Topçular hattı OSM verisinde araçlara açık bir feribot olarak var. Valhalla bu hattı kullanabiliyor.
- **Sorun 1:** Valhalla varsayılan ayarda feribotları cezalandırıyor (`use_ferry=0.5`). Gebze → Yalova'da feribotlu yol (29,6 km) hiç sunulmuyor, yalnızca Osmangazi Köprüsü (39,3 km, ücretli) çıkıyordu.
- **Sorun 2:** Feribot OSM'de ücretli (`toll=yes`) işaretli. Valhalla'nın ücret kaçınması (`exclude_tolls` ya da `use_tolls=0`) feribotu da dışlıyor. "Ücretli yollardan kaçın" Gebze → Yalova için 116 km'lik dolambaçlı bir rota veriyordu.

## Yapılanlar

| Talep | Uygulama |
|---|---|
| Google'daki rota seçenekleri | "Ücretli yollardan kaçın", "Otoyollardan kaçın", "Feribotlardan kaçın". Kesin dışlama kullanılıyor (`exclude_tolls`, `exclude_highways`, `exclude_ferries`). Seçenekler planla birlikte kaydediliyor (`trips.route_options`) ve plan açılınca geri geliyor |
| Feribotun rotaya alınması | Feribot cezası kaldırıldı (`use_ferry=1`). Feribotlu yol daha hızlıysa ana rota, değilse alternatif olarak sunuluyor (Gebze → Yalova: köprü 35 dk, feribot ~61 dk) |
| Ücretli yoldan kaçınırken feribot | Adaylar sırayla toplanıyor: kesin ücretsiz rota, ardından normal rotalar (alternatifler dahil), gerekirse en kısa rota. Yalnızca **karayolu ücreti olmayanlar** tutuluyor. Feribot ücreti "ücretli yol" sayılmıyor; bu ayrım Valhalla manevralarındaki `toll`/`ferry` bayraklarından yapılıyor. Herkese açık sunucunun saniyede 1 istek kuralına uyuluyor |
| Rota üzerinde önerilen yerler | Rota belirlenince en fazla **6** yer öneriliyor: tarihî yer, müze, doğal güzellik, turistik nokta. Ayrıntılar aşağıda |
| Rota çizimini geliştirme | **Türkçe yol tarifi**: adıma dokununca harita o noktaya gidiyor, feribot ve ücretli adımlar işaretli. Alternatiflerde "En hızlı / Ücretli / Feribot / Otoyolsuz" rozetleri var. Yer ayrıntısındaki "rotaya eklenirse" hesabı aynı seçeneklerle yapılıyor |

**Önerilerin seçimi:**
- **Hangi yerler:** Yalnızca kayda değer olanlar alınıyor: Vikipedi/Vikiveri kaydı ya da koruma etiketi olan yerler, veya kale, ören yeri, şelale, kanyon, milli park, kervansaray, seyir noktası gibi öne çıkan türler.
- **Rota boyunca dağılım:** Rota eşit parçalara bölünüyor ve her parçadan en iyi yer seçiliyor. Başlangıç ve varışın hemen çevresi önerilmiyor (rotanın %10'u, en fazla 15 km). Böylece öneriler şehirde kümelenmiyor.
  - **İlk sürümdeki sorun:** İstanbul → Ankara'da önerilerin 4'ü Fatih'teki müzelerdi.
  - **Düzeltmeden sonra canlıda:** İstanbul Oyuncak Müzesi (16. km), Sipahiler Göleti (95), Deprem Müzesi (156), Bolu Müzesi (275), Yeniçağa Kuş Gözlemevi (316), Havacılık Müzesi (440).
- **Arama genişliği:** Rota uzunluğuna göre değişiyor: kısa rotada 1,5 km, orta rotada 3 km, uzun rotada 5 km.
- **Kullanım:**
  - Öneriler haritada yıldızla gösteriliyor ve tek dokunuşla doğru sıraya durak olarak ekleniyor.
  - Eklenen yer listeden düşüyor.
  - Öneriler gizlenebiliyor.

## Değişen dosyalar

- **Rota motoru:** `src/lib/geo-services/valhalla.ts`
- **Öneriler (sunucu):** `src/lib/geo-services/features.ts` (`routeSuggestions`, `spreadAlongRoute`)
- **Veritabanı:** `supabase/migrations/20261116001200_route_options.sql` (`trips.route_options`, `save_trip_plan(..., p_route_options)`, `route_suggestions()`) ve `20261116001300_route_suggestions_spread.sql` (rota boyunca dağılım). İkisi de canlıya uygulandı.
- **Arayüz:** `src/components/map/route-extras.tsx` (seçenekler, yol tarifi, öneriler), `route-summary.tsx`, `map-layers.tsx`, `map-explorer.tsx`

## Testler

- **Birim:**
  - Valhalla istek ve yanıt eşlemesi: seçenekler, feribot ücretinin ayrımı, yol tarifi adımları.
  - Üç adımlı ücretsiz rota stratejisi ve tekilleştirme.
  - Önerilerin rota boyunca dağıtılması.
- **Veritabanı (PGlite):**
  - Seçeneklerin normalize edilip kaydedilmesi; eski çağrı biçiminin çalışmaya devam etmesi.
  - `route_suggestions`: restoran, sıradan anıt ve uzaktaki yer gelmez; puan sıralaması.
- **E2E (gerçek Valhalla ve Supabase):**
  - Gebze → Yalova'da feribot alternatifi sunuluyor ve ücretli yol sayılmıyor.
  - Ücretli yoldan kaçınınca feribotlu rota ilk sırada (45 km'den kısa).
  - Feribot + ücretli kaçınma ve otoyol kaçınma doğru çalışıyor.
  - Planlayıcıda seçenek kaydediliyor ve geri geliyor; Türkçe yol tarifinde feribot adımı görünüyor.
  - İstanbul → Ankara'da öneriler 6'yı aşmıyor; öneriden durak eklenebiliyor; öneriler gizlenebiliyor.

## Bilinen sınırlar

- **Trafik:** Trafik bilgisi yok. Valhalla'nın herkese açık sunucusu canlı trafik vermiyor; süreler tipik hızlara göre hesaplanıyor.
- **Feribot süresi:** Valhalla'nın feribot süresi tahmini (bekleme dahil) gerçek sefer saatlerini bilmiyor.
- **Alternatif rotalar:** Ara duraklı rotalarda alternatif hesaplanmıyor (Valhalla kısıtı). "Ücretli yoldan kaçın" bu durumda ücretsiz ya da feribotlu en uygun tek rotayı veriyor.
- **Yol tarifinin dili:** Türkçe metin Valhalla'nın Türkçe çeviri dosyasından geliyor. Bazı cümleler mekanik ("… caddesine doğru sağa dönün").
