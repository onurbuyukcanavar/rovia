# ROVIA — Kurulum

## 1. Yerel geliştirme

```bash
npm install
cp .env.example .env.local   # değerleri doldur
npm run dev                   # http://localhost:3000
npm run check                 # typecheck + lint + test
```

`NEXT_PUBLIC_*` değişkenleri derleme sırasında koda gömülür. Değiştirdikten sonra `dev` veya `build` yeniden başlatılmalı.

## 2. Supabase (proje: `rovia`, ref `lbocidoprcqiuxtqhoye`, eu-central-1)

Şema `supabase/migrations/` altında ve projeye uygulandı. Uzak şemanın parmak izi yerel test veritabanıyla birebir doğrulandı. Yeni bir ortamda:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npm run db:types   # src/lib/database.types.ts yeniden üretilir
```

## 3. Supabase Dashboard ayarları (manuel, bir kez)

**Authentication → URL Configuration**
- Site URL: `https://<alan-adı>` (geliştirmede `http://localhost:3000`)
- Redirect URLs: `http://localhost:3000/**`, `https://<alan-adı>/**`, Vercel önizlemeleri için `https://*-<vercel-ekip>.vercel.app/**`

**Authentication → Email Templates** (sunucu taraflı doğrulama için bağlantıları değiştir)
- Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/panel`
- Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`

**Authentication → Sign In / Providers**
- Email: açık, "Confirm email" açık.
- Google: aşağıdaki §4'teki Client ID ve Secret girilir.
- **Allow manual linking: açık.** Ayarlar sayfasındaki "Google hesabını bağla" özelliği bunu gerektirir.

**SMTP:** Supabase'in yerleşik e-posta servisi yalnızca organizasyon üyelerinin adreslerine ve düşük hızla gönderim yapar. Gerçek kullanıcılara açılmadan önce özel SMTP (Resend, Postmark vb.) gerekir.

## 4. Google OAuth (yalnızca giriş ve kayıt için)

1. Google Cloud Console → yeni proje "ROVIA".
2. APIs & Services → OAuth consent screen: External, uygulama adı ROVIA, destek e-postası. Scope'lar: yalnızca `openid`, `email`, `profile`.
3. Credentials → Create OAuth client ID → Web application.
   - Authorized JavaScript origins: `http://localhost:3000`, `https://<alan-adı>`
   - Authorized redirect URI: `https://lbocidoprcqiuxtqhoye.supabase.co/auth/v1/callback`
4. Client ID ve Secret → Supabase → Auth → Providers → Google.

## 5. Harita altyapısı (açık kaynak — anahtar gerekmez)

Varsayılan ayarlarla ek kurulum gerekmez: harita OpenFreeMap'ten, rotalar FOSSGIS Valhalla sunucusundan gelir.
İsteğe bağlı ortam değişkenleri:

| Değişken | Varsayılan | Ne zaman değiştirilir |
|---|---|---|
| `NEXT_PUBLIC_MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` | Kendi karo sunucusu veya farklı stil |
| `VALHALLA_URL` | `https://valhalla1.openstreetmap.de` | Kendi Valhalla sunucumuza geçişte (canlı trafik arttığında) |
| `PHOTON_URL` | `https://photon.komoot.io` | Kendi Photon sunucusu; `""` → adres yedeği kapalı |

**Kendi Valhalla sunucusu (canlıya geçerken):** 8 GB RAM'li bir VPS'te resmî imajla:
```bash
docker run -d --name valhalla -p 8002:8002 -v $PWD/valhalla:/custom_files \
  -e tile_urls=https://download.geofabrik.de/europe/turkey-latest.osm.pbf \
  ghcr.io/valhalla/valhalla-scripted:latest
```
Ardından önüne HTTPS ters vekil koyup `VALHALLA_URL` güncellenir.

### 5.1 OSM verisini yükleme (ilgi noktaları, yerleşimler, il/ilçe)

1. Supabase Dashboard → **Connect** → **Session pooler** bağlantı dizesini kopyala
   (`postgresql://postgres.<ref>:<ŞİFRE>@aws-…pooler.supabase.com:5432/postgres`). Doğrudan bağlantı IPv6'dır,
   GitHub Actions IPv6 desteklemediği için pooler kullanılır. Şifreyi bilmiyorsan Database → Settings'ten sıfırla.
2. GitHub → Settings → Secrets → Actions → `SUPABASE_DB_URL` olarak ekle.
3. GitHub → Actions → **OSM verisi içe aktarma (Türkiye)** → *Run workflow*. Sonra her ayın 3'ünde kendiliğinden çalışır.

## 6. Vercel (yayın: https://rovia-seven.vercel.app)

- Proje: `rovia` (ekip `onurbuyukcanavar`), GitHub `onurbuyukcanavar/rovia` deposuna bağlı. `main` dalına her gönderim üretime, diğer dallar önizlemeye yayınlanır.
- Fonksiyon bölgesi `fra1` (Supabase eu-central-1'e yakın), Node 22.
- Erişim koruması (Vercel Authentication) yalnızca önizlemelerde; üretim adresi herkese açık (uygulama kendi girişini ister).
- Ortam değişkenleri: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (tüm ortamlar), `NEXT_PUBLIC_SITE_URL=https://rovia-seven.vercel.app` (yalnızca üretim; önizlemede `VERCEL_URL` kullanılır). İsteğe bağlı: §5'teki harita değişkenleri. Gizli anahtar yok.
- **Supabase'de bir kez:** Authentication → URL Configuration → Site URL `https://rovia-seven.vercel.app`, Redirect URLs'e `https://rovia-seven.vercel.app/**` ve `https://*-onurbuyukcanavars-projects.vercel.app/**` eklenir. Google OAuth istemcisinin "Authorized JavaScript origins" listesine `https://rovia-seven.vercel.app` eklenir.
- GPS kaydı (Kayıt Modu) tarayıcıda yalnızca HTTPS'te çalışır: telefonda test için üretim adresi kullanılır.
