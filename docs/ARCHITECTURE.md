# ROVIA — Teknik Mimari ve Gereksinim Analizi

> Sürüm 0.1 · 16 Kasım 2026 · PHASE 1 öncesi analiz
> Bu doküman "İlk Görev" bölümündeki 12 maddeyi karşılar. Kod tabanıyla birlikte güncellenir.

---

## 0. Özet: Ürün vizyonunu etkileyen doğrulanmış teknik sınırlar

Kod yazmadan önce resmî dokümanlardan doğruladığım ve ürün davranışını değiştiren beş bulgu:

| # | Konu | Bulgu | ROVIA'daki karşılığı |
|---|------|-------|----------------------|
| 1 | **Google Maps kayıtlı yerler** | Maps Platform'da (Places API dahil) kullanıcının kişisel Google Maps listelerine erişen **bir API yok**. Eski "My Places" erişimi 2013'te kaldırıldı. Google'ın **Data Portability API**'sinde `dataportability.maps.starred_places` ve `dataportability.saved.collections` scope'ları var. Ancak bu API **AEA (EEA) kullanıcıları** için çıkarıldı (DMA kapsamı; bazı kaynaklar Birleşik Krallık'ı da sayıyor). `starred_places` scope'u **"Restricted"** sınıfında, yani ek güvenlik denetimi gerektiriyor. 18 yaş altı hesaplarda çalışmıyor. | Türkiye'deki kullanıcılar için birincil yöntem **Google Takeout içe aktarma**: *Saved Places.json* (GeoJSON) + liste başına CSV dosyaları. Ek olarak manuel ekleme ve Google Maps bağlantısından ekleme var. Data Portability API ileride AEA kullanıcılarına özel, isteğe bağlı bir kanal olarak eklenebilir (Faz 5+, Google doğrulaması gerekir). |
| 2 | **Places verisi saklama** | Places API içeriği önbelleğe alınamaz veya saklanamaz. Tek istisna **place_id**: süresiz saklanabilir. Koordinatlar en çok 30 gün önbelleğe alınabilir. | `saved_places` ve `trip_stops` tablolarında Google kaynaklı kayıtlar için **place_id** saklanır. İsim, adres, puan ve saat bilgisi gösterim anında çekilir. Koordinatlar `coords_cached_at` ile tutulur ve 30 günde yenilenir. Kullanıcının yazdığı etiket ve notlar ile Takeout'tan gelen veriler kullanıcının kendi verisidir, saklanabilir. |
| 3 | **Rota boyunca arama** | Places API (New) **Text Search**, `searchAlongRouteParameters.polyline.encodedPolyline` parametresiyle Routes API'nin döndürdüğü rotaya göre sonuç veriyor. `routingParameters.origin` ile rotanın ortasından başlatılabiliyor. Routing summary ile her yere sapma süresi ve mesafesi de hesaplanabiliyor. | "İstanbul→Ankara benzinlik" senaryosu doğrudan destekleniyor. "Rotaya eklenirse oluşacak yeni süre ve mesafe" bilgisi routing summary ile alınabiliyor. |
| 4 | **Fiyatlandırma (Mart 2025 modeli)** | 200 dolarlık aylık kredi kaldırıldı. Yerine SKU başına ücretsiz aylık kota geldi: **Essentials 10.000, Pro 5.000, Enterprise 1.000** istek. Compute Routes: ≤10 ara durak ve trafiksiz istekler **Essentials**. Trafik duyarlı rota veya 11–25 ara durak **Pro**. Ara durak üst sınırı 25. | Varsayılan rota hesabı trafiksiz ve Essentials. "Trafiğe göre süre" kullanıcı seçimi olur. Ara durak sayısı UI'da 25 ile sınırlanır, 10 üzeri için "Pro ücreti" uyarısı gösterilir (yalnızca yönetici yapılandırmasında). Alan maskeleri SKU'yu belirlediği için liste ve detay istekleri ayrıştırılır (bkz. §12). |
| 5 | **Tarayıcıda arka planda GPS** | Web Geolocation, ekran kilitlenince veya sekme arka plana geçince birçok mobil tarayıcıda askıya alınıyor. Web'de garantili arka plan takibi yok. | Wake Lock API ile ekran açık tutulur, kesintiler "boşluk" olarak işaretlenir, noktalar IndexedDB'de biriktirilir ve kullanıcıya bu sınır açıkça anlatılır. Kesintisiz kayıt ancak ileride yerel uygulama (Capacitor/React Native) ile mümkün. |

---

## 1. Gereksinim analizi

ROVIA üç deneyim etrafında kurulur. Her modül bunlardan birine hizmet eder:

| Deneyim | Modüller | Kritik bağımlılık |
|---|---|---|
| **DISCOVER** | Haritayı Keşfet, ROVIA Explore, rota üzeri arama, yer detayı | Maps JS, Places (New), Routes |
| **JOURNEY** | Yolculuk Planla, Yolculuk Kaydı (GPS), Yolculuklarım, Garage, maliyet | Routes, Geolocation, IndexedDB, PWA |
| **REMEMBER** | Favoriler, Seyahat Günlüğü, ROVIA Journal, PDF/HTML, paylaşım, GPX/KML | Storage, TipTap, PDF motoru |

**İşlevsel olmayan gereksinimler:**
- Güvenlik: konum verisi hassas. RLS her tabloda zorunlu. Varsayılan gizlilik "yalnızca ben". Paylaşımlar yalnızca SECURITY DEFINER fonksiyonlarla ve seçilmiş alanlarla açılır.
- Mobil öncelik: harita ağırlıklı ekranlar, 44 px+ dokunma alanları, alt navigasyon.
- Veri kaybetmeme: Journal'da otomatik kayıt, yerel yedek ve sürüm çakışması algılama. GPS'te çevrimdışı kuyruk.
- Maliyet kontrolü: tüm Google Places ve Routes çağrıları sunucu üzerinden, alan maskeli ve hız sınırlı.
- i18n: tüm metinler tek sözlükte. İlk dil Türkçe.
- Dürüstlük: çalışmayan özellik gösterilmez. Gelecek fazlar menüde "Yakında" etiketiyle pasif durur.

---

## 2. Teknik mimari

```
┌──────────────────────── Tarayıcı / PWA ─────────────────────────┐
│ Next.js App Router (React 19)                                    │
│  • Server Components (veri) + Client Components (harita, editör)│
│  • Maps JS API (tarayıcı anahtarı, HTTP referrer kısıtlı)        │
│  • GPS kaydedici: watchPosition → filtre → IndexedDB → toplu POST│
│  • TipTap editör → otomatik kayıt (debounce + sürüm kontrolü)    │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS (Server Actions / Route Handlers)
┌───────────────▼──────────── Next.js sunucu (Vercel) ────────────┐
│ proxy.ts: oturum yenileme + iyimser yönlendirme                  │
│ Veri Erişim Katmanı (src/lib/dal): her çağrıda getUser()         │
│ /api/maps/*  → Routes API, Places API (New)  [SUNUCU ANAHTARI]   │
│ /api/recordings/*  → GPS toplu yazma, doğrulama (zod)            │
│ /api/export/*  → PDF (headless Chromium), HTML, GPX/KML          │
│ Hız sınırlama (Postgres tabanlı token bucket, sonra Upstash)     │
└───────────────┬──────────────────────────────────────────────────┘
                │ supabase-js (kullanıcı JWT'si → RLS)
┌───────────────▼──────────────────── Supabase ───────────────────┐
│ Postgres 17 + RLS · Auth (e-posta, Google OIDC) · Storage (media)│
│ SECURITY DEFINER RPC: paylaşım görünümleri, panel istatistikleri │
│ pg_cron: GPS saklama politikası, süresi dolmuş koordinat temizliği│
└──────────────────────────────────────────────────────────────────┘
```

**Temel ilke:** İş verisine erişim her zaman **kullanıcının JWT'si** ile, yani RLS altında yapılır. `service_role` anahtarı yalnızca hesap silme ve zamanlanmış temizlik gibi dar sunucu işlerinde kullanılır ve hiçbir zaman istemciye gitmez.

**Mobil yol haritası:** UI ve iş mantığı ayrık (`src/lib/*` saf TS). İleride Capacitor ile aynı kod native kabuğa alınarak arka plan GPS eklentisi kullanılabilir.

---

## 3. Teknolojiler ve gerekçeleri

| Katman | Seçim (doğrulanan sürüm) | Gerekçe |
|---|---|---|
| Framework | **Next.js 16.4** (App Router, Cache Components, `proxy.ts`) | Brief'in önerisi. Server Actions ile ayrı backend gerekmez. Next 16'da `middleware` adı `proxy` oldu, buna göre kuruldu. |
| UI | React 19.3, **Tailwind CSS 4.3**, lucide-react | Tasarım token'ları CSS değişkenlerinde (`@theme`), koyu mod hazır. |
| Dil | TypeScript (strict) + **zod 4** | Tüm sınır girdileri (form, API, dosya) şemayla doğrulanır. |
| Veritabanı | **Supabase** (Postgres 17, Auth, Storage, RLS) — `@supabase/ssr 0.12` | Brief'in tercihi. RLS ile kullanıcı izolasyonu veritabanı seviyesinde sağlanır. Bölge: `eu-central-1` (Frankfurt), Türkiye'ye düşük gecikme ve KVKK açısından AB'de barındırma. |
| Harita | Google Maps JS API + `@vis.gl/react-google-maps` (Faz 2) | Google'ın resmî React kütüphanesi. Advanced Markers, Map ID ile stil. |
| Rota / Yer | **Routes API** (`computeRoutes`), **Places API (New)** (Text Search + SAR, Place Details, Autocomplete), Geocoding | Legacy Directions/Places yerine yeni API'ler. Eski API'ler "Legacy" statüsünde. |
| Editör | **TipTap** (ProseMirror) | Olgun, JSON çıktılı, uzantılı (görsel + açıklama, alıntı, liste, link). |
| PDF | **HTML/CSS baskı şablonu + headless Chromium** (`puppeteer-core` + `@sparticuz/chromium`) | Tek şablon hem HTML dışa aktarmayı, hem paylaşım sayfasını, hem PDF'i besler. CSS Paged Media ile sayfa numarası, bölüm başı ve görsel taşma kontrolü yapılır. Gömülü fontlarla Türkçe karakter sorunu olmaz. Alternatif olarak `@react-pdf/renderer` değerlendirildi: tipografi ve zengin metin eşlemesi zayıf kaldığı için yedek seçenek. |
| Fontlar | Manrope (arayüz), Newsreader (Journal ve PDF), `@fontsource` ile kendi sunucumuzdan | Latin-ext alt kümeleri dahil (ğ, ş, ı, İ). Harici font CDN'i yok. |
| Test | Vitest + PGlite (gerçek Postgres, WASM) | Migration'lar ve RLS politikaları her test çalışmasında gerçek Postgres'te doğrulanır. Faz 10'da Playwright E2E eklenir. |
| Hosting | **Vercel** + Supabase | Next.js ile birinci sınıf entegrasyon. Hesabında Vercel bağlantısı mevcut. |
| Hata izleme | Faz 1: yapılandırılmış sunucu logları. Faz 10: Sentry (ücretsiz katman) | Ücretli servis eklenmeden önce sorulacak. |
| E-posta | Supabase Auth e-postaları. Üretimde özel SMTP (Resend vb.) | Supabase'in yerleşik SMTP'si saatte çok düşük limitli. Canlıya geçmeden SMTP gerekir (karar sende). |

---

## 4. Google Maps Platform gereksinimleri

**Etkinleştirilecek API'ler (Google Cloud projesi):**
1. Maps JavaScript API — harita, Advanced Markers (Map ID gerekir).
2. Places API (New) — Autocomplete, Text Search (rota boyunca arama dahil), Place Details, Place Photos.
3. Routes API — `computeRoutes` (alternatif rotalar, ara duraklar, polyline).
4. Geocoding API — ters geocoding (GPS kaydının başlangıç ve bitiş adresleri).
5. Maps Static API — PDF ve paylaşım kartları için rota görseli (Faz 7/9; kullanım şartı o fazda yeniden kontrol edilecek).

**İki ayrı anahtar:**

| Anahtar | Ortam değişkeni | Kısıtlama |
|---|---|---|
| Tarayıcı | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | HTTP referrer: `https://<alan-adı>/*`, `http://localhost:3000/*`. API kısıtı: yalnızca Maps JavaScript API. |
| Sunucu | `GOOGLE_MAPS_SERVER_KEY` | API kısıtı: Routes, Places (New), Geocoding, Static Maps. Hiçbir zaman `NEXT_PUBLIC_` önekiyle tanımlanmaz. Vercel'de IP kısıtı mümkün değil, bu yüzden API kısıtı ve kota sınırı zorunlu. |

**Maliyet kontrolleri:** Google Cloud'da SKU başına günlük kota tavanı ve bütçe alarmı kurulur (Google bütçeleri harcamayı durdurmaz, yalnızca uyarır; tavan kota ile konur). Uygulama tarafında kullanıcı başına hız sınırı uygulanır. Autocomplete için session token kullanılır.

**Atıf ve şartlar:** Places sonuçları Google haritası üzerinde gösterilir. Harita dışındaki listelerde Google Maps logosu ve atıf gösterilir. Fotoğraflarda `authorAttributions` gösterilir. Uygulamanın kullanım şartları ve gizlilik politikası Google'ın şartlarına atıf yapar (Faz 10'da hukuki metinler).

---

## 5. Google OAuth gereksinimleri

- **Akış:** Supabase Auth → Google OIDC (Authorization Code + PKCE, `@supabase/ssr`).
- **Scope'lar:** yalnızca `openid`, `email`, `profile`. Google API'lerine kullanıcı adına erişim yok. Bu yüzden **Google refresh token'ı saklanmaz**. Hassas veya kısıtlı scope olmadığı için Google uygulama doğrulaması yalnızca marka doğrulaması seviyesinde kalır.
- **Google Cloud Console:** OAuth consent screen (uygulama adı ROVIA, destek e-postası, gizlilik ve şartlar URL'leri), "Web application" türünde OAuth Client ID. Yetkili yönlendirme URI'si: `https://<supabase-ref>.supabase.co/auth/v1/callback`.
- **Supabase Dashboard:** Auth → Providers → Google (Client ID ve Secret), Site URL ve Redirect URL'ler (`https://<alan-adı>/auth/callback`, `http://localhost:3000/auth/callback`). **Manual linking** açık olmalı, böylece Ayarlar'dan Google hesabı bağlanabilir ve kaldırılabilir (`linkIdentity` / `unlinkIdentity`).
- **"connected_accounts" tablosu:** Brief'teki tablo yerine Supabase'in `auth.identities` kaydı tek doğruluk kaynağı olarak kullanılır. Bağlantı durumu buradan okunur. Böylece aynı bilginin iki yerde tutulup tutarsızlaşması ve token kopyalanması önlenir. Data Portability API (AEA) eklenirse onun token'ları ayrı, şifreli bir tabloda (Supabase Vault) tutulur.
- **Bağlantı kaldırma kuralı:** Kullanıcının tek giriş yöntemi Google ise bağlantı kaldırılmadan önce şifre belirlemesi istenir. Aksi halde hesap kilitlenir.

---

## 6. Google Maps kişisel kayıtlı yerler: doğrulanmış sınır ve çözüm

**Sonuç:** Kullanıcının Google Maps hesabındaki kayıtlı listelerine (Favoriler, Gitmek istiyorum, Yıldızlı ve özel listeler) Maps Platform üzerinden otomatik erişim **resmî olarak desteklenmiyor**. Bu özellik "Google hesabını bağla, listelerin gelsin" şeklinde **yapılamaz**. Kullanıcıya bu şekilde vaat edilmeyecek.

**Uygulanacak çözüm (Faz 5):**
1. **Google Takeout içe aktarma (birincil yol).** Kullanıcı takeout.google.com'da "Kaydedilenler" ve "Haritalar (yerleriniz)" seçeneklerini işaretleyip ZIP'i ROVIA'ya yükler. Ayrıştırma tarayıcıda yapılır. Desteklenen dosyalar: `Saved Places.json` (GeoJSON, Yıldızlı yerler, koordinatlı) ve `Kaydedilenler/*.csv` (liste başına; başlık, not, Google Maps URL'si). CSV'de koordinat yoksa URL'deki CID veya `!3d!4d` değerleri çözülür. Çözülemezse yer, kullanıcı onayıyla Places Text Search ile eşleştirilir.
2. **KML içe aktarma.** My Maps dışa aktarımları (`.kml` ve `.kmz`).
3. **Google Maps bağlantısından ekleme.** `maps.app.goo.gl` ve `google.com/maps/place/...` linkleri sunucuda çözülür, place_id veya koordinat çıkarılır.
4. **Manuel ekleme.** Arama (Autocomplete) veya haritada nokta seçimi.
5. **Mükerrer önleme.** Sırasıyla `(user_id, google_place_id)`, sonra `(user_id, source, source_ref)` benzersiz kısıtları, son olarak 30 m yakınlık ve ad benzerliği uyarısı.
6. **Kaynak ayrımı.** `saved_places.source` alanı `manual | google_takeout | google_link | kml | explore | trip` değerlerinden birini alır, `import_batch_id` ile hangi içe aktarmadan geldiği izlenir. UI'da kaynak rozeti gösterilir.
7. **Kullanıcıya açıklama.** İçe aktarma ekranında "Google, kayıtlı listelerinize üçüncü taraf uygulamaların doğrudan erişmesine izin vermiyor; bu yüzden listelerinizi Google Takeout ile bir kez dışa aktarıp yüklemeniz gerekiyor" metni ve adım adım kılavuz gösterilir.

---

## 7. Veritabanı tasarımı

Migration: `supabase/migrations/20261116000100_core_schema.sql` ve devamı. Brief'teki şemadan bilinçli sapmalar:

| Brief | ROVIA şeması | Neden |
|---|---|---|
| `profiles.id` + `user_id` | `profiles.id = auth.users.id` | 1:1 ilişkide ikinci anahtar gereksiz. Kayıtta tetikleyiciyle otomatik oluşturulur. |
| `connected_accounts` | `auth.identities` (Supabase) | §5'teki gerekçe. |
| `trip_photos`, `travelogue_entry_photos.storage_path` | **`media_assets`** (tek tablo) + bağlantı tabloları `journal_note_media`, `travelogue_entry_media` | Aynı fotoğraf günlükte, seyahatnamede ve galeride tek kayıt olarak kullanılır. Tekrar yükleme olmaz. |
| `trip_notes` | `journal_notes` (Seyahat Günlüğü) | Kısa not, anı ve başlık. Konum ve zaman opsiyonel. |
| `trip_recordings` tek satır | `trip_recordings` + **`recording_segments`** | Duraklat ve devam et her segmenti açar ve kapatır. Hareket süresi, duraklama süresi ve GPS boşlukları doğru hesaplanır. |
| `trip_shares`, `travelogue_shares` | `shares` (tek tablo, iki nullable FK + CHECK) | Aynı token ve gizlilik mantığı tek yerde. Paylaşılacak alanlar `options jsonb` ile seçilir. Ev adresini korumak için `privacy_radius_m` var. |
| — | `travelogue_sections.kind` | Kapak, giriş, yolculuk bilgisi, harita, kronoloji, keşifler, galeri, değerlendirme, son söz ve özel bölümler. Her biri gizlenebilir ve sıralanabilir (§9.7). |
| — | `travelogue_entry_revisions` | Otomatik kayıt sürüm geçmişi (son 50 sürüm). |
| — | `vehicles`, `user_settings`, `import_batches` | Garage, gizlilik ve saklama tercihleri, içe aktarma izlenebilirliği. |

**İlişki diyagramı:**

```
auth.users 1─1 profiles 1─1 user_settings
     │
     ├─< trips >─< trip_stops            (stop_order benzersiz, ertelenebilir)
     │     │
     │     ├─< trip_recordings ─< recording_segments ─< gps_points
     │     │
     │     ├─< journal_notes >─< journal_note_media >─┐
     │     │                                          │
     │     └─1 travelogues ─< travelogue_sections     │
     │               └─< travelogue_entries ─< travelogue_entry_media >─┤
     │                        └─< travelogue_entry_revisions            │
     ├─< media_assets  <────────────────────────────────────────────────┘
     ├─< saved_places  (source, google_place_id, import_batch_id)
     ├─< vehicles
     ├─< import_batches
     └─< shares (trip_id | travelogue_id, token, visibility, options)
```

**Bütünlük kuralları:**
- Tüm FK'ler `on delete cascade` (kullanıcı silinince tüm veri silinir; KVKK "silme hakkı"). İstisna: `trip_id` opsiyonel olan alanlar `set null`.
- Koordinat CHECK'leri (−90..90 ve −180..180), enum benzeri alanlar için CHECK listeleri, `updated_at` tetikleyicileri.
- Kayıt tutarlılığı: bir kullanıcının aynı anda en fazla **bir** aktif kaydı olabilir (kısmi benzersiz indeks).
- Sahiplik tutarlılığı: alt kayıtlar (ör. `travelogue_entries.trip_id`) üst kaydın sahibiyle aynı kullanıcıya ait olmak zorunda. RLS'de `WITH CHECK` ile EXISTS kontrolü yapılır, böylece başka kullanıcının yolculuğuna kayıt bağlanamaz.
- Performans: her `user_id` ve FK sütununda indeks, `(recording_id, recorded_at)` bileşik indeksi, `tags` için GIN, metin araması için `content_text` üzerinde ileride `tsvector`.

**RLS:**
- Her tabloda RLS açık ve `force`'lu. Varsayılan erişim yok.
- Sahip politikaları `(select auth.uid()) = user_id` biçiminde (Supabase'in performans önerisi).
- `anon` rolü hiçbir tabloyu doğrudan okuyamaz. Paylaşılan içerik yalnızca `get_shared_trip(token)` ve `get_shared_travelogue(token)` SECURITY DEFINER fonksiyonlarıyla, seçilmiş alanlarla döner (Faz 9).
- Storage: `media` kovası private. Yol şablonu `{user_id}/{uuid}.{ext}`. Politika `storage.foldername(name)[1] = auth.uid()::text`. Paylaşılan görseller kısa ömürlü imzalı URL ile verilir.

**GPS saklama stratejisi:**
- Kayıt sırasında filtrelenmiş noktalar yazılır (ham değil, bkz. §9.4).
- Tamamlanınca rota Douglas–Peucker ile sadeleştirilip `trip_recordings.simplified_polyline` alanına yazılır. Arşiv ve paylaşım bunu kullanır.
- Ham noktalar `user_settings.gps_raw_retention_days` (varsayılan 90 gün, 0 = hemen sil, null = süresiz) sonunda pg_cron ile silinir. Kullanıcı istediği an tüm GPS verisini silebilir.

---

## 8. Sayfa ve ekran mimarisi

| Rota | Ekran | Faz | Masaüstü düzen | Mobil |
|---|---|---|---|---|
| `/` | Tanıtım (pazarlama) | 1 | Tam genişlik | Tam genişlik |
| `/giris`, `/kayit`, `/sifremi-unuttum`, `/sifre-yenile` | Kimlik doğrulama | 1 | Bölünmüş (görsel + form) | Tek sütun |
| `/auth/callback`, `/auth/confirm` | OAuth ve e-posta doğrulama dönüşü | 1 | — | — |
| `/panel` | Genel Bakış (dashboard) | 1 | Sol menü + içerik | Alt menü |
| `/ayarlar` | Profil, bağlı hesaplar, oturum | 1 (gizlilik ve veri: 10) | Sol menü + içerik | Alt menü (Diğer) |
| `/harita` | Haritayı Keşfet | 2 | Harita + sağ detay paneli | Tam ekran harita + alt sayfa |
| `/kesfet` | ROVIA Explore | 8 | Harita + kategori rafı | Harita + kaydırmalı kategoriler |
| `/yolculuklar`, `/yolculuklar/[id]` | Yolculuklarım ve detay | 3/6 | Liste + sağ önizleme | Kart listesi |
| `/planla`, `/planla/[id]` | Yolculuk Planla | 3 | Sol: duraklar, orta: harita, sağ: yer detayı | Harita + çekilebilir durak paneli |
| `/kayit-modu` | Yolculuk Kaydı | 4 | Sade, büyük tipografi | Tam ekran, büyük butonlar |
| `/favoriler`, `/favoriler/ice-aktar` | Favorilerim ve içe aktarma | 5 | Liste + harita | Sekmeli (liste/harita) |
| `/gunluk` | Seyahat Günlüğüm | 6 | Zaman çizelgesi + galeri | Dikey akış |
| `/seyahatnameler`, `/seyahatnameler/[id]`, `.../yazi/[entryId]` | ROVIA Journal | 7 | Editör + sağ harita ve bölüm paneli | Editör tam ekran |
| `/garaj` | ROVIA Garage | 8 | Kart ızgarası | Liste |
| `/p/[token]`, `/s/[token]` | Paylaşılan yolculuk ve seyahatname | 9 | Okuma düzeni | Okuma düzeni |

**Navigasyon:** Masaüstünde sol panelde brief'teki 11 öğe. Mobil alt menüde 5 öğe: Genel Bakış, Harita, **Kayıt** (ortada, büyük), Yolculuklar ve Diğer. "Diğer" sayfası kalan tüm bölümleri içerir, böylece hiçbir işlev mobilde kaybolmaz.

---

## 9. ROVIA Journal: veri ve editör mimarisi

**Veri modeli:**
- `travelogues`: başlık, alt başlık, giriş (TipTap JSON), kapak (`cover_media_id`), amaç, `visibility`, `status (draft|published)`, `trip_id` (opsiyonel; yolculuksuz seyahatname de olabilir).
- `travelogue_sections`: `kind` (cover, introduction, trip_info, map, chronicle, places, gallery, evaluation, epilogue, custom), `title`, `content jsonb`, `is_visible`, `sort_order`. Yeni seyahatname oluşturulurken §9.7'deki 10 bölüm varsayılan sırayla eklenir. Kullanıcı bölümleri sıralayabilir, gizleyebilir ve kendi bölümlerini ekleyebilir.
- `travelogue_entries`: yer yazıları. Yapılandırılmış alanlar ayrı sütunlardadır: `introduction`, `narrative`, `history_notes`, `personal_review` (hepsi TipTap JSON, hepsi opsiyonel). Ayrıca `location_name`, `address`, `latitude`, `longitude`, `google_place_id`, `saved_place_id`, `visited_at` (**ziyaret zamanı**), `created_at` (**yazım zamanı**), `tags text[]`, `sort_order`, `sort_mode` ile `content_text` (arama ve PDF için düz metin) ve `version` (iyimser kilit) tutulur.
- **Kronoloji:** Varsayılan sıralama `visited_at`, eşitlikte `sort_order`. Kullanıcı elle sıralarsa seyahatname `ordering = 'manual'` moduna geçer ve `sort_order` esas alınır. Eve döndükten 3 gün sonra yazılan yazı, ziyaret saatine göre doğru yere oturur.
- **Medya:** `travelogue_entry_media(entry_id, media_id, caption, sort_order)`. Fotoğraf `media_assets`'te bir kez durur. Aynı fotoğraf günlük notunda da kullanılabilir.

**Editör (TipTap):** StarterKit (başlık H2/H3, kalın, italik, alıntı, listeler), Link (yalnızca `http`/`https` ve `rel=noopener`), özel `figure` düğümü (görsel + açıklama, `media_id` referanslı; URL değil), Placeholder, CharacterCount. Yapıştırılan HTML, ProseMirror şemasıyla temizlenir. Sunucuda render sırasında da yalnızca şemadaki düğümler üretilir (XSS koruması).

**Otomatik kayıt protokolü:**
1. Her değişiklikte içerik anında **IndexedDB yerel taslağa** yazılır. Sekme kapanırsa veya bağlantı koparsa yazı kaybolmaz.
2. 1,5 saniye sessizlikten sonra (ya da en geç 10 saniyede bir) sunucuya `saveEntry({id, expectedVersion, patch})` gönderilir.
3. Sunucu `version` değeri eşleşirse yazar, `version+1` döner ve önceki içeriği `travelogue_entry_revisions` tablosuna ekler (son 50 tutulur).
4. Eşleşmezse (başka sekme veya cihaz) **çakışma** döner. UI iki sürümü gösterir ve kullanıcı seçer. Hiçbir sürüm sessizce ezilmez.
5. Durum göstergesi: "Kaydediliyor…", "Kaydedildi · 14:32", "Çevrimdışı – cihazda saklandı", "Çakışma".
6. `beforeunload`: kaydedilmemiş değişiklik varsa uyarır.

**Harita bağlantısı:** Yolculuk haritasında yazı işaretçileri (özel ikon). İşaretçi `?entry=<id>` ile yazıyı açar, yazıya tıklamak haritayı `panTo` ile o konuma götürür.

**Yapay zekâ (opsiyonel, Faz 7 sonrası):** İlk sürümde yok. Eklendiğinde öneriler ayrı bir "öneri" katmanında gösterilir ve kullanıcı onaylamadan metne girmez. Kabul edilen bloklar `ai_assisted` işaretiyle saklanır ve PDF'te istenirse not düşülür. Sistem talimatı kullanıcının yaşamadığı deneyimi ve doğrulanmamış tarih bilgisini üretmeyi yasaklar.

---

## 10. PDF üretim altyapısı

- **Yaklaşım:** Sunucuda bir "kitap" HTML'i üretilir (React Server Component). Bu HTML `@page` kurallarıyla A5 veya A4 sayfa düzenine sahiptir. Headless Chromium ile (`puppeteer-core` + `@sparticuz/chromium`, Vercel Node fonksiyonu) PDF'e çevrilir.
- **Kitap düzeni:** Kapak (tam sayfa kapak fotoğrafı, ROVIA logosu, başlık, başlangıç→varış, tarih), künye (mesafe, süre, durak sayısı), harita (Static Maps ile sadeleştirilmiş polyline), bölümler (her biri yeni sayfada, `break-before: page`), kronolojik anlatı, yer yazıları, galeriler (`break-inside: avoid` ile ızgara), değerlendirme ve son söz.
- **Tipografi:** Newsreader gövde (10,5/15 pt), Manrope başlık ve künye. Fontlar gömülü (latin-ext alt kümeleri, Türkçe karakterler test edilir). Dul ve yetim satır kontrolü, alt bilgide sayfa numarası ve bölüm adı.
- **Görseller:** Baskı için kısa kenarı 1600 px olacak şekilde yeniden boyutlandırılmış türevler kullanılır. Böylece dosya boyutu ve bellek kontrol altında kalır.
- **Kuyruk:** Uzun seyahatnamelerde fonksiyon zaman aşımı riski vardır. Bu yüzden `exports` tablosu (`pending → done/failed`) ile arka planda üretim yapılır, sonuç Storage'a yazılır ve kullanıcıya hazır olduğu bildirilir.
- **HTML dışa aktarma:** Aynı şablonun görselleri base64 gömülü, tek dosyalık sürümü. **DOCX:** ileride `docx` paketiyle.

---

## 11. Geliştirme fazları ve bağımlılıklar

```
F1 Altyapı ──► F2 Harita/Routes/Places ──► F3 Planlama ──► F8 Explore+Garage
   │                     │                     │
   │                     └──────► F4 GPS Kaydı ┴──► F6 Arşiv+Günlük ──► F7 Journal ──► F9 Paylaşım
   └──► F5 Favoriler+İçe aktarma (F2'nin Places detayına bağlı)                          │
                                                                    F10 Test+Yayın ◄─────┘
```

| Faz | Bağımlı olduğu fazlar | Senden gereken |
|---|---|---|
| 1 | — | Supabase projesi onayı (ücretsiz) |
| 2 | 1 | Google Cloud projesi, faturalandırma, 2 anahtar, Map ID |
| 3 | 2 | — |
| 4 | 1, 2 | Mobil cihazda test (HTTPS gerekli; Vercel önizleme) |
| 5 | 1, 2 | Google OAuth Client ID ve Secret (Supabase'e girilecek) |
| 6 | 3, 4 | — |
| 7 | 6 | — |
| 8 | 3 | Yakıt fiyatı için veri kaynağı kararı (manuel mi, API mi?) |
| 9 | 6, 7 | Alan adı (paylaşım bağlantıları için) |
| 10 | hepsi | KVKK aydınlatma metni ve şartlar onayı (hukuki metinleri sen yazabilirsin) |

---

## 12. Maliyet kalemleri

**Google Maps Platform (Mart 2025 sonrası model, SKU başına ücretsiz aylık kota):**

| Özellik | API çağrısı | SKU sınıfı | Ücretsiz kota/ay | Maliyet notu |
|---|---|---|---|---|
| Harita gösterimi | Maps JS – Dynamic Maps (yükleme başına) | Essentials | 10.000 | Sayfa başına bir yükleme. SPA'da harita örneği yeniden kullanılır. |
| Adres arama | Autocomplete (New) – session | Essentials | 10.000 | Session token ile oturum başına faturalandırılır. |
| Rota hesabı | Compute Routes (trafiksiz, ≤10 durak) | Essentials | 10.000 | Varsayılan. Durak değişiminde 600 ms debounce uygulanır. |
| Trafikli rota / 11–25 durak | Compute Routes Pro | Pro | 5.000 | Yalnızca kullanıcı isterse. |
| Rota boyunca arama | Text Search (New) – SAR | Pro (temel alanlar) / **Enterprise** (puan, saat, telefon) | 5.000 / 1.000 | Listede yalnızca Pro alanları istenir (`id, displayName, location, formattedAddress, types, primaryType`). |
| Yer detayı | Place Details (New) | Essentials / Pro / Enterprise (alan maskesine göre) | 10.000 / 5.000 / 1.000 | Puan, yorum sayısı, saatler ve telefon yalnızca kullanıcı yere tıklayınca çekilir. |
| Yer fotoğrafı | Place Photos | Enterprise | 1.000 | Detayda 1 kapak fotoğrafı. Galeri isteğe bağlı. |
| Ters geocoding | Geocoding | Essentials | 10.000 | Kayıt başına 2 çağrı (başlangıç ve bitiş). |
| PDF/paylaşım haritası | Maps Static | Essentials | 10.000 | Dışa aktarma başına 1. |

Kota üstü fiyatlar SKU ve hacim kademesine göre değişir. Örnek: Text Search Enterprise ilk kademede 1.000 istek başına 35 $, Compute Routes Enterprise 15 $. **Kesin bütçe için Google Maps Platform fiyat hesaplayıcısında senin tahmini kullanıcı sayınla hesap yapılmalı.** Faz 2'de tahmini aktif kullanıcı başına çağrı modelini çıkaracağım.

**Diğer servisler:**

| Servis | Başlangıç | Ölçeklenince |
|---|---|---|
| Supabase | Free (500 MB DB, 1 GB Storage, 7 gün hareketsizlikte duraklatma) | Pro: aylık 25 $'dan başlar (8 GB DB, 100 GB Storage, günlük yedek). Canlıya geçişte önerilir. |
| Vercel | Hobby (yalnızca ticari olmayan kullanım) | Pro: kullanıcı başına aylık 20 $. Ticari yayında gerekli. |
| E-posta (SMTP) | — | Resend veya Postmark ücretsiz ya da düşük ücretli katman. |
| Hata izleme | Loglar | Sentry ücretsiz katman. |
| Alan adı | — | Yıllık 10–20 $ (`.app` veya `.com.tr`). |

> Ücretli bir kaleme geçmeden önce senden onay alınacak.

---

## Kaynaklar
- Google Data Portability API — scopes ve politika: https://developers.google.com/data-portability/user-guide/scopes · https://developers.google.com/data-portability/policy
- Places API (New) — Search along route: https://developers.google.com/maps/documentation/places/web-service/search-along-route
- Places API politikaları (place_id istisnası, atıf): https://developers.google.com/maps/documentation/places/web-service/policies
- Fiyat kategorileri ve ücretsiz kotalar: https://developers.google.com/maps/billing-and-pricing/pricing-categories
- Mart 2025 fiyat değişikliği: https://developers.google.com/maps/billing-and-pricing/march-2025
- Routes API kullanım ve faturalandırma: https://developers.google.com/maps/documentation/routes/usage-and-billing
- Google Maps listeleri ve Takeout: https://support.google.com/maps/answer/7280933
