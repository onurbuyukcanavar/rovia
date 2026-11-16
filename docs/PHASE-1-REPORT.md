# PHASE 1 Raporu — Proje altyapısı

**Tarih:** 16 Kasım 2026 · **Durum:** ✅ Tamamlandı ve gerçek ortamda doğrulandı. CI: GitHub Actions (`.github/workflows/ci.yml`).

## Yapılanlar

| Alan | Teslim edilen |
|---|---|
| Mimari | `docs/ARCHITECTURE.md`: 12 maddelik analiz, doğrulanmış teknik sınırlar, maliyet kalemleri |
| Proje | Next.js 16.4 (App Router, Cache Components, `proxy.ts`), React 19.3, TypeScript strict, Tailwind 4.3 |
| Tasarım sistemi | Renk token'ları (lacivert, kırık beyaz, sıcak gri, amber), Manrope ve Newsreader fontları (kendi sunucumuzdan, Türkçe karakter desteği), Button, Field, Alert, Badge, SubmitButton bileşenleri |
| Logo | Kıvrılan yol ve amber varış noktası. SVG, favicon, Apple ikonu ve PWA PNG ikonları (192, 512, maskable) |
| Veritabanı | 19 tablo, 186 kısıt, 71 indeks, 72 RLS politikası, 42 tetikleyici, Storage `media` kovası ve klasör izolasyonu. Supabase projesine uygulandı. |
| Tipler | `npm run db:types`: tipler migration'dan otomatik üretiliyor, şema ile kod senkron |
| Kimlik doğrulama | E-posta ve şifre ile kayıt ve giriş, Google OAuth (yalnızca kimlik scope'ları), şifre sıfırlama, e-posta doğrulama dönüşü, oturum yenileme (`proxy.ts`), korumalı rotalar, açık yönlendirmeye karşı `next` doğrulaması |
| Panel | Karşılama, hızlı işlemler, 6 istatistik (`dashboard_stats()` RPC, RLS altında), son ve yaklaşan yolculuklar, kayıtlı yerler, son yazılar. Hepsi gerçek sorgularla çalışıyor, sahte veri yok. |
| Ayarlar | Profil (ad, kullanıcı adı ve benzersizlik), bağlı hesaplar (Google bağla/kaldır, tek giriş yöntemi koruması), şifre belirleme ve değiştirme, oturum kapatma |
| Responsive | Masaüstünde sol menü (11 bölüm). Mobilde alt menü (5 öğe, ortada büyük "Kayıt" düğmesi) ve "Diğer" sayfası |
| i18n | Tüm metinler `src/i18n/tr.ts` içinde. Yeni dil = yeni sözlük dosyası |
| Güvenlik başlıkları | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy (konum yalnızca kendi kaynağımızda) |
| PWA | Web manifest (`start_url=/panel`, standalone), ikonlar. Service worker PHASE 4'te (çevrimdışı GPS kuyruğu ile) eklenecek. |

## Test sonuçları

| Test | Sonuç |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ 0 hata |
| ESLint | ✅ 0 uyarı |
| Production build | ✅ 18 rota. Panel ve ayarlar Partial Prerender ile çalışıyor |
| DB testleri (gerçek Postgres, Vitest + PGlite) | ✅ 16/16 |
| ↳ Başka kullanıcının verisini okuma, güncelleme, silme | ✅ engellendi |
| ↳ Başkası adına kayıt ekleme / sahipliği devretme | ✅ engellendi |
| ↳ Başkasının yolculuğuna durak, kayıt veya seyahatname bağlama | ✅ engellendi (`ownership_violation`) |
| ↳ Anonim kullanıcının tablo ve RPC erişimi | ✅ engellendi |
| ↳ Storage'da başka kullanıcının klasörüne yükleme | ✅ engellendi |
| ↳ Tek başlangıç ve varış, durak sırasını takas etme, tek aktif GPS kaydı, idempotent GPS yazımı, mükerrer favori | ✅ |
| ↳ Kullanıcı silinince tüm verinin silinmesi (KVKK) | ✅ |
| Uzak Supabase şeması ve test edilen şema | ✅ parmak izi birebir aynı (sütun, kısıt, indeks, politika, tetikleyici) |
| Supabase Security Advisor | ✅ 0 bulgu |
| Supabase Performance Advisor | ℹ️ Yalnızca "kullanılmamış indeks" (boş veritabanında beklenen durum) |
| Ekran kontrolü (masaüstü 1440 px, mobil 390 px) | ✅ Tanıtım, giriş, kayıt ve 404 sayfaları. `/panel` oturumsuzken `/giris?next=/panel` adresine yönleniyor |

| **E2E (Playwright, GitHub Actions, gerçek Supabase)** | ✅ **13/13**: koruma yönlendirmesi, açık yönlendirme engeli, form doğrulamaları, hatalı şifre mesajı, giriş → panel → çıkış, `next` dönüşü, profil güncelleme ve kalıcılığı, kullanıcı adı benzersizliği, bağlı hesaplar, PostgREST üzerinden RLS (okuma, güncelleme, silme, sahte ekleme), anonim erişim engeli, mobil alt menü |
| **Uzak Supabase'de SQL ile RLS** | ✅ **13/13** (işlem sonunda geri alındı, iz bırakmadı) |
| Sunucu log denetimi | ✅ E2E sırasında sıfır hata. CI, hata görürse başarısız olacak şekilde ayarlandı |

## Testler sırasında bulunup düzeltilen hatalar
1. Sunucudan istemci bileşenine ikon fonksiyonu geçiriliyordu. Yalnızca Supabase yapılandırılmışken ortaya çıkıyordu (`app-shell`).
2. Partial Prefetching'in oturumlu ön-render'ında Supabase Auth `Date.now()` ve `fetch` hatası üretiyordu. `io()` ile ertelendi.
3. Playwright masaüstü projesi mobil testi de çalıştırıyordu.
4. Tanıtım ve giriş sayfasındaki rota çizimi metinle çakışıyordu. Türkçe yerelde "FIND" kelimesi "FİND" diye büyütülüyordu.

## Bilinçli olarak sonraya bırakılanlar
- **Gerçek e-posta ile yeni kayıt testi:** Supabase'in yerleşik e-posta servisi yalnızca organizasyon üyelerine gönderim yapıyor. Özel SMTP kurulunca E2E'ye eklenecek. Arayüz bu durumu (`email_address_not_authorized`) Türkçe mesajla karşılıyor.
- **Google ile giriş:** Google Cloud OAuth istemcisi gerekiyor (docs/SETUP.md §4). Kod hazır.
- **Hesap silme ve veri dışa aktarma düğmeleri:** PHASE 10. Şema tarafı (cascade silme) hazır ve test edildi.

## Test hesapları
`e2e-alice@rovia.test` ve `e2e-bob@rovia.test`: e-postası doğrulanmış, boş test hesapları. Şifreleri GitHub Secrets'ta (`E2E_ALICE_PASSWORD`, `E2E_BOB_PASSWORD`).
