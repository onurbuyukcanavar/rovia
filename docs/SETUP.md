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

## 4. Google OAuth (giriş ve kayıt için)

1. Google Cloud Console → yeni proje "ROVIA".
2. APIs & Services → OAuth consent screen: External, uygulama adı ROVIA, destek e-postası. Scope'lar: yalnızca `openid`, `email`, `profile`.
3. Credentials → Create OAuth client ID → Web application.
   - Authorized JavaScript origins: `http://localhost:3000`, `https://<alan-adı>`
   - Authorized redirect URI: `https://lbocidoprcqiuxtqhoye.supabase.co/auth/v1/callback`
4. Client ID ve Secret → Supabase → Auth → Providers → Google.

## 5. Google Maps Platform (PHASE 2'de gerekli)

Ayrıntılar `docs/ARCHITECTURE.md` §4'te. Özet:
- Faturalandırma hesabı, ardından Maps JavaScript, Places (New), Routes, Geocoding ve Maps Static API'leri etkinleştirilir.
- **Tarayıcı anahtarı** (`NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`): HTTP referrer kısıtlı, yalnızca Maps JavaScript API.
- **Sunucu anahtarı** (`GOOGLE_MAPS_SERVER_KEY`): Routes, Places, Geocoding ve Static ile API kısıtlı. Asla `NEXT_PUBLIC_` önekiyle tanımlanmaz.
- Map ID (Advanced Markers için).
- Her SKU için günlük kota tavanı ve bütçe alarmı.

## 6. Vercel

Ortam değişkenleri: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL` (üretim alan adı). PHASE 2'den itibaren Google anahtarları da eklenir.
