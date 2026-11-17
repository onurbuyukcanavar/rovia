# PHASE 10 — Test, güvenlik, performans ve yayın

## Güvenlik
### Veritabanı
- Tüm tablolarda RLS açık; anonim rol hiçbir tablodan satır göremez. `tests/db/security.test.ts` her tabloyu tarar: başka kullanıcının satırını okuma/güncelleme/silme ve onun adına ekleme engellenir; anonim çağrılabilen SECURITY DEFINER fonksiyonlar yalnızca `share_get` ve `media_shared`.
- En az yetki: yardımcı fonksiyonların anonim yetkisi kaldırıldı; `share_copy` SECURITY INVOKER.
- Fotoğraf kovası: yalnızca WebP/JPEG (istemcinin konum/cihaz verisini silerek yeniden kodladığı biçimler), en fazla 8 MB, özel.
- Supabase güvenlik denetçisi: kritik bulgu yok. Öneri: "Leaked password protection" Supabase panelinden açılmalı.

### Uygulama — bulgular ve düzeltmeler
1. Yüksek — açık yönlendirme (`safeNextPath`): `/./\evil.com` gibi değerler normalleşince dış siteye yönlendirebiliyordu. Düzeltildi, testlendi.
2. Orta — API'de CSRF: Origin/Sec-Fetch-Site denetimi; başka kaynaktan gelen durum değiştiren istekler 403.
3. Orta — JSON gövde boyutu sınırı: 512 KB (GPS eşitleme 2 MB); aşımda 413, bozuk JSON'da 400.
4. Orta — Content-Security-Policy ve ek başlıklar (CORP, X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies, genişletilmiş Permissions-Policy).
5. Düşük — SSRF: HTML dışa aktarma ve paylaşım kartı yalnızca kendi Storage imzalı adreslerini indirir.
6. Düşük — API yanıtları `private, no-store`; bilinmeyen API adresleri JSON 404; doğru 401 mesajları.
- Sorunsuz bulunanlar: tüm sunucu işlemleri oturum + zod doğrulaması; service role anahtarı yok; git geçmişinde sızmış anahtar yok; `npm audit` 0 açık; içe aktarma ayrıştırıcıları DOCTYPE/ENTITY reddeder.
- Bilinçli karar: CSP'de `script-src 'unsafe-inline'` — Next 16'da nonce her sayfayı dinamik işlemeye zorlar (PPR ve hız kaybı). Dış betik ve `eval` yasak.

## Performans
| Sayfa | Önce (KB, gzip) | Sonra |
|---|---|---|
| /harita, /planla | 595 | 205 |
| /kesfet | 580 | 193 |
| /seyahatnameler/[id] | 720 | 199 |
| /…/yazi/[entryId] | 709 | 190 |
| /p/[token] | 460 | 171 |
- MapLibre, TipTap, Supabase istemcisi ve zod yalnızca gerektiğinde yüklenir; next/font; paralel sunucu sorguları; statik dosyalara 1 yıllık önbellek.
- Yer arama: PL/pgSQL genel plan sorunu (fonksiyon içinde ~700 ms, sorgunun kendisi 12 ms; şimdi ~20–250 ms) ve 2 harfli sorgular (2,9 sn → ~0,1 sn).
- CI'da performans bütçesi: sayfa boyutu bütçeyi aşarsa build düşer.

## KVKK
- Verilerimi indir: tüm kullanıcı verisi JSON (günde 5).
- Hesabımı sil: "HESABIMI SİL" onayı + son 15 dk içinde giriş + önce fotoğraflar; tüm veriler zincirleme silinir. Canlı veritabanında geçici kullanıcılarla doğrulandı (silme ve koruma adımları).
- Hukuki metinler güncellendi.

## Testler
- Birim + veritabanı: 404. E2E (gerçek Supabase): 91 geçti, 2 atlandı (tek kullanımlık kullanıcıyla hesap silme — e-posta onayı açık olduğundan canlıda elle doğrulandı; canlı tanılama — yalnızca yayın kontrolünde).
- Yeni E2E: güvenlik, API hataları, hesap, performans.
