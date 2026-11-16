# PHASE 5 Raporu — Favoriler ve Google Maps verisi içe aktarma

**Durum:** Tamamlandı (16 Kasım 2026)
**Yayın:** https://rovia-seven.vercel.app/favoriler

## Ne teslim edildi

| Brief maddesi | Uygulama |
|---|---|
| Favori yerler / "Daha sonra gideceğim" | `/favoriler`: harita (tek GeoJSON katmanı; binlerce yerde akıcı) + liste. Favoriler amber, daha sonra gidilecekler lacivert |
| Filtreler | Liste türü (sayılarıyla), kategori, kaynak (ROVIA'da eklenenler / Google Maps'ten), metin araması (Türkçe karakter duyarsız) |
| Yer ekleme | ROVIA aramasıyla, haritaya dokunarak ya da Google Maps paylaşım bağlantısıyla; ad, liste, kategori (boşsa OSM'den otomatik) ve not |
| Haritadan ekleme | Haritayı Keşfet'te yer ayrıntısında "Favorilere ekle" / "Daha sonra git"; kayıtlıysa "Kayıtlı · …" gösterilir |
| Düzenleme / silme | Satır içi düzenleme (ad, kategori, liste, not); silme iki adımlı onaylı |
| Yolculuğa ekleme | Favoriden "Yolculuk planla" → `/planla?hedef=…` (varış dolu gelir). Planlayıcıda "Favorilerimden ekle": boş başlangıç → varış → ara durak sırasıyla doldurur |
| Google verisi | `/favoriler/ice-aktar` sihirbazı (aşağıda) |
| Kaynağın ayrı gösterimi (§4.3, §7) | Her yerde kaynak rozeti (Google Maps, Google Maps bağlantısı, KML, GPX, CSV, Harita, ROVIA); kaynak filtresi |

## Google Maps listeleri neden doğrudan çekilmiyor? (Araştırma)

- **Google Maps Platform API'leri** kullanıcının kişisel kayıtlı listelerine erişim sunmuyor; yalnızca genel yer verisi veriyor (ve ücretli).
- **Google Data Portability API**, "Saved/starred places" verisi için bir kapsam (scope) tanımlıyor.
  - Bu kapsam Google'ın **"Restricted"** sınıfında. Kullanmak için uygulama doğrulaması ve bağımsız bir **güvenlik değerlendirmesi** gerekiyor; bu değerlendirme ücretli ve yıllık yenileniyor.
  - API yalnızca belirli bölgelerdeki hesaplarda kullanılabiliyor.
  - Bu nedenle ROVIA'nın şu aşamasında uygulanabilir değil; sahte bir "Google'dan otomatik çek" düğmesi konmadı.
- **Seçilen yol: Google Takeout.** Google'ın resmî dışa aktarma aracı.
  - Kullanıcı arşivi indirip yükler. Arayüzde adım adım anlatılıyor; Takeout'taki ürün adları İngilizce ve Türkçe karşılıklarıyla verildi.
  - **Bilinen sınır:** Takeout'un liste dosyalarında (`Saved/*.csv`) çoğu yer için koordinat yok, yalnızca Google Maps bağlantısı var. Bu yüzden:
    - Bağlantıda koordinat varsa (`!3d…!4d…`, `@lat,lng`, `q=`) kullanılır.
    - Yoksa yer adı ROVIA'nın açık OSM verisinde aranır. Yalnızca güçlü eşleşmeler (benzerlik ≥ 0,6) **"tahmini konum"** olarak gösterilir ve varsayılan olarak seçili gelmez.
    - Hiç bulunamayanlar aktarılamaz; kullanıcıya açıkça söylenir.
  - `Saved Places.json` (yıldızlı yerler) koordinat içerir ve doğrudan aktarılır.
- Uygulamanın Google sunucularına bağlandığı tek yer, Google Maps paylaşım bağlantılarının yönlendirmelerini çözmektir (yalnızca konum başlığı okunur, sayfa içeriği alınmaz).

## İçe aktarma sihirbazı

- **Desteklenen dosyalar:** Google Takeout `.zip` (açmadan), `Saved Places.json`, liste `.csv`, `.kml`, `.kmz`, `.gpx`, genel `.csv` (ad/enlem/boylam; Türkçe sütun adları da tanınır). KML klasör adları liste adı olur.
- **Gizlilik:** Dosya tarayıcıda okunur, sunucuya yüklenmez. Sunucuya yalnızca seçilen yerlerin adı, konumu, notu, kaynak bağlantısı ve liste adı gider.
- **Akış:** Dosya → önizleme (durum: konum var / tahmini / bulunamadı; tek tek seçim) → 500'lük parçalar hâlinde aktarma ve ilerleme çubuğu → sonuç (eklenen, mükerrer, geçersiz).
- **Liste türü:** Takeout'taki "Want to go" listesi "Daha sonra gideceğim" olarak, diğerleri "Favoriler" olarak gelir.

## Güvenlik ve veri bütünlüğü

- **Migration:** `20261116001000_favorites.sql`
- **`save_places`** (SECURITY INVOKER, RLS geçerli): tek kayıt kapısı, en fazla 1000 kayıt/çağrı. Bir kayıt şu durumlarda **mükerrer** sayılır ve atlanır:
  - aynı OSM kaydı,
  - aynı kaynak + kaynak bağlantısı,
  - 75 m içinde aynı ad (Türkçe karakterden bağımsız `name_key`).
  - Aynı dosya iki kez yüklenirse hiçbir şey çoğalmaz.
- **Kategori çıkarımı:** 60 m içindeki benzer adlı OSM ilgi noktasından; kullanıcının seçtiği kategori önceliklidir.
- **İçe aktarma kaydı:** Her dosya için bir `import_batches` satırı oluşur (dosya adı, sayılar).
- **Hız sınırı:** `places` kovası, dakikada 60 / günde 1000 işlem.
- **Dosya güvenliği:**
  - Zip bombasına karşı girdi sayısı (2000) ve açılmış boyut (100 MB) sınırı var; yalnızca ilgili uzantılar açılır.
  - Dosya en fazla 25 MB, 5000 yer.
  - XML'de dış varlık (XXE) işlenmez.
  - OSM bağlantıları yalnızca http(s).
- **Bağlantı çözümleme güvenliği:** yalnızca Google Maps alan adları (izin listesi), en fazla 6 yönlendirme, gövde okunmaz. Bu, SSRF'ye karşı koruma sağlar.
- **Sunucu eylemleri:** Hepsi oturum ister ve girdileri zod ile doğrular. Silme ve güncelleme RLS ile yalnızca kendi kayıtlarında çalışır.

## Testler

- **Veritabanı (PGlite):** `tests/db/favorites.test.ts`, 9 test. Kapsam: mükerrer kuralları, OSM çıkarımı, RLS yalıtımı, sınırlar, ad eşleştirme. Tüm veritabanı testleri: 55.
- **Birim testleri:**
  - Ayrıştırıcılar: 16 test (Takeout zip/json/csv, KML/KMZ, GPX, Türkçe CSV, zip bombası, XXE).
  - Google URL çözümleme: 5 test.
  - Toplam: 152 test geçti.
- **E2E (`e2e/favorites.spec.ts`, gerçek Supabase):**
  - Takeout arşivi: önizleme → aktarma → kaynak rozeti → tekrar aktarımda mükerrer.
  - KML: aktarma → filtreler → düzenleme → kategori filtresi → `?hedef=` ile planlama → "Favorilerimden ekle" → silme. Haritanın çizildiği de doğrulanıyor.
  - Arama ile yer ekleme ve ikinci eklemede "zaten kayıtlı".
  - Desteklenmeyen dosya hatası.
  - Haritayı Keşfet'te yer ayrıntısından favoriye ekleme.
- **Kalite kontrolleri:** typecheck, lint ve production build temiz.

## Bilinen sınırlar

- Takeout CSV'lerinde koordinatı olmayan ve OSM'de adıyla bulunamayan yerler aktarılamıyor. Bu Google'ın dosya biçiminden kaynaklanıyor. Kullanıcı bu yerleri "Yer ekle" ile arayarak ekleyebilir.
- Google Maps listeleri otomatik ve sürekli eşitlenmiyor; kullanıcı istediğinde yeniden Takeout yükleyebilir. Mükerrerler atlandığı için güvenli.
- Liste görünümü filtre sonucunun ilk 300 yerini gösteriyor; harita filtredeki tüm yerleri gösteriyor.
