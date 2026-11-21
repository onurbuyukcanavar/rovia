# ROVIA tasarım dili ve tema token'ları

Ana sayfa (`src/app/(marketing)/page.tsx`) ve panel (`/panel`) yeni dili tanımlar: gece laciverti yüzeyler,
amber vurgu, ince (extralight) ve sıkı aralıklı büyük başlıklar, serif italik amber vurgular, numaralı üst
başlıklar ("01 —— BAŞLIK"), çerçeveli camsı kartlar, yol/rota motifleri. Uygulama iki temada çalışır:

| Tercih | `rovia-theme` çerezi | Sonuç |
| --- | --- | --- |
| Koyu (varsayılan) | `dark` veya yok | `<html data-theme="dark">` |
| Aydınlık | `light` | `<html data-theme="light">` — sıcak kâğıt yüzeyler, aynı amber |
| Sistem | `system` | `prefers-color-scheme`'e göre; cihaz değişince anında |

Bu belge sayfaları taşıyacak ajanlar içindir: taşıma mekanik olmalı.

## 1. Token'lar (globals.css `@theme` + `[data-theme]`)

Bileşenlerde **yalnızca** bu sınıfları kullanın. Değerler temaya göre değişir.

| Token | Sınıf örnekleri | Kullanım |
| --- | --- | --- |
| `surface` | `bg-surface` | Sayfa zemini (body/html zaten bu). Opak kutu gerektiğinde (ör. gap-px ızgara hücreleri) |
| `raised` | `bg-raised` | Kart (koyuda yarı saydam/camsı, aydınlıkta yarı saydam beyaz). `.card` bunu kullanır |
| `sunken` | `bg-sunken` | Gömük alan: iskelet (skeleton), sekme rayı, bilgi kutusu, görsel yer tutucu |
| `overlay` | `bg-overlay` | Opak yüzen yüzey: `<dialog>`, açılır menü, alt sayfa, harita üstü panel |
| `chrome` | `bg-chrome` | Kabuk çubukları (kenar menü, mobil üst çubuk, alt menü, yapışkan başlıklar) + `backdrop-blur` |
| `field` | `bg-field` | Form alanı zemini (`inputClass()` kullanın) |
| `line` / `line-strong` | `border-line`, `divide-line`, `border-line-strong` | Kart/ayraç çizgisi / form alanı, kesik çizgili boş durum |
| `fg` | `text-fg` | Birincil metin, başlıklar |
| `fg-muted` | `text-fg-muted` | Gövde metni, açıklamalar |
| `fg-subtle` | `text-fg-subtle` | Yardımcı metin, tarih, ikincil ikon, placeholder (AA'yı geçer) |
| `accent` | `bg-accent`, `border-accent/40`, `stroke-accent` | Amber **dolgu** (düğme, nokta, rozet). Yazı rengi olarak KULLANMAYIN (aydınlıkta 2.3:1) |
| `accent-strong` | `hover:bg-accent-strong` | Dolgu üzerine gelince |
| `accent-fg` | `text-accent-fg` | Amber dolgu üzerindeki yazı |
| `accent-soft` | `bg-accent-soft` | Amber tonlu zemin (seçili satır, uyarı notu) |
| `accent-ink` | `text-accent-ink` | Zemin üzerinde okunur amber yazı/ikon (üst başlık, bağlantı, etkin ikon) |
| `accent-glow` | `text-accent-glow` | Büyük serif italik vurgu ve gösterge rakamları (yalnızca büyük yazı; aydınlıkta 3.9:1) |
| `focus` | `outline-focus` | Odak halkası (base katmanında global) |
| `danger` / `danger-soft` | `text-danger`, `bg-danger-soft`, `border-danger/30` | Hata |
| `success` / `success-soft` | `text-success`, `bg-success-soft` | Başarı |
| `backdrop` | `backdrop:bg-backdrop` | Pencere arka perdesi (`dialog::backdrop` zaten ayarlı) |
| `--shadow-card`, `--shadow-overlay` | `shadow-[var(--shadow-card)]` | Kart / yüzen yüzey gölgesi |
| `--sky-*`, `--road-fill`, `--backdrop-glow` | `.panel-hero-sky`, `.page-backdrop` | Karşılama sahnesi (koyuda gece, aydınlıkta gün doğumu) |

Saydamlık: `bg-fg/[0.05]` (hover), `bg-fg/10` (ayraç), `border-fg/25` gibi `fg` türevleri her iki temada doğru çalışır.

### Kontrast (WCAG AA, hesaplandı)

| | koyu: surface `#0a111d` | koyu: raised | aydınlık: surface `#f7f5f0` | aydınlık: raised | aydınlık: sunken |
| --- | --- | --- | --- | --- | --- |
| fg | 17.4 | 15.8 | 16.5 | 17.4 | 15.1 |
| fg-muted | 9.6 | 8.8 | 7.1 | 7.5 | 6.5 |
| fg-subtle | 6.0 | 5.4 | 5.3 | 5.6 | 4.85 |
| accent-ink | 9.4 | 8.6 | 4.95 | 5.2 | 4.5 |
| danger | 7.7 | 7.1 | 5.2 | 5.5 | 4.8 |
| success | 8.8 | 8.0 | 5.4 | 5.7 | 4.9 |

`accent-fg` amber dolgu üzerinde 7.7:1. Birincil düğme (`bg-fg text-surface`) 17:1.

## 2. Eski sınıf → yeni sınıf eşlemesi

| Eski (ham palet) | Yeni |
| --- | --- |
| `bg-paper` (sayfa) | `bg-surface` (çoğu zaman hiç yazmayın; body zaten) |
| `bg-paper-50`, `bg-white` (kart) | `bg-raised` ya da `.card` |
| `bg-white` (input) | `inputClass()` / `<Field>` (`bg-field`) |
| `bg-paper/95` + blur (yapışkan çubuk) | `bg-chrome backdrop-blur` |
| `bg-paper` (dialog, popover) | `bg-overlay` |
| `bg-sand-100`, `bg-sand-100/60` | `bg-sunken` |
| `hover:bg-sand-100/60`, `hover:bg-white` | `hover:bg-fg/[0.04]` … `/[0.07]` |
| `border-sand-200`, `divide-sand-200` | `border-line`, `divide-line` |
| `border-sand-300` | `border-line-strong` |
| `text-ink-900`, `text-ink-800` | `text-fg` |
| `text-ink-700`, `text-stone-700`, `text-stone-600` | `text-fg-muted` |
| `text-stone-500` | `text-fg-subtle` |
| `text-amber-700`, `text-amber-600` (yazı), `text-amber-400` (gecede) | `text-accent-ink` |
| `text-amber-300` (serif vurgu, gecede) | `text-accent-glow` |
| `bg-amber-500 text-ink-950` | `bg-accent text-accent-fg` (ya da `<Button variant="accent">`) |
| `bg-amber-100 text-amber-900` | `bg-accent-soft text-accent-ink` (ya da `<Badge tone="accent">`) |
| `bg-ink-900 text-paper` düğme | `<Button>` (primary: `bg-fg text-surface`) |
| `bg-ink-900 text-paper` ikon kutusu | `border border-line bg-raised text-accent-ink` |
| `bg-danger/5`, `bg-success/10` | `bg-danger-soft`, `bg-success-soft` (ya da `<Alert>`, `<Badge tone>`) |
| `text-paper`, `text-paper/70`, `border-paper/[0.08]`, `bg-paper/[0.04]` (panel gece sınıfları) | `text-fg`, `text-fg-muted`, `border-line`, `bg-raised` |
| `focus:border-ink-700 focus:ring-amber-400/25` | `focus:border-accent focus:ring-accent/20` (`inputClass()` içinde) |
| SVG `stroke="rgb(247 245 240 / .3)"` | `className="stroke-fg/30"`; gradyan durağı `style={{ stopColor: "var(--color-fg)" }}` |
| `.eyebrow` | aynen (artık temalı) ya da amber için `<SectionEyebrow>` / `.eyebrow-accent` |

## 3. Taşıma kuralı (ÖNEMLİ: geçiş katmanı)

Kabuk içindeki (`src/app/(app)`) **taşınmamış** sayfalar eski açık paletle yazılmıştır. Koyu temada okunmaz
olmasınlar diye `globals.css`teki geçiş kuralı, içinde `[data-themed]` bulunmayan `#icerik` alanını **her temada
aydınlık token'larla** çizer (kabuk yine temayı izler). Bir sayfayı taşıdığınızda:

1. Sayfanın kök öğesine `data-themed` ekleyin (`<div data-themed className="mx-auto …">`).
2. Sayfadaki ve yalnızca bu sayfanın kullandığı bileşenlerdeki ham sınıfları tablo 2'ye göre değiştirin.
3. Paylaşılan bir bileşen başka taşınmamış sayfada da kullanılıyorsa token'a çevirmek güvenlidir: geçiş
   kuralı orada aydınlık token'ları verir, görünüm değişmez.
4. Her iki temada ekran görüntüsü alıp bakın (aşağıda).

Kabuk dışındaki taşınmamış kökler açıkça aydınlık "tema adası"dır: `/indir`, `/offline`, `/p/[token]`
(`data-theme="light"`). Taşınınca bu öznitelik kaldırılır. Tüm sayfalar bitince geçiş kuralı silinir.

**Tema adası:** `data-theme="dark|light"` herhangi bir öğeye konabilir; altındaki tüm token'lar o temayla çözülür
(`<dialog>` dahil). Ana sayfa bu yolla her zaman koyudur (`theme-dark-only` + `<DarkOnly />`), içindeki aydınlık
bölümler `data-theme="light"` taşır. Ana sayfayı temalandırmayın.

## 4. Bileşen kalıpları

- **Sayfa başlığı:** `<PageHeader eyebrow="Yolculuklar" index={1} title="Yolculuklarım" accent="yolda biriken." description="…" actions={…} />`
  — amber çizgili üst başlık, `font-extralight` büyük başlık, isteğe bağlı serif italik `accent-glow` vurgu.
- **Karşılama (hero):** `PanelHero` (`src/components/dashboard/hero.tsx`): `.panel-hero-sky` + yol SVG'si. Sayfa zemini için `.page-backdrop`.
- **Numaralı bölüm başlığı:** `<SectionTitle index={2} id="x-title" aside={…}>İstatistikler</SectionTitle>` ve
  `<section aria-labelledby="x-title">`. Yalnızca etiket için `<SectionEyebrow index?>`. Numara/çizgi `aria-hidden`.
- **Kart:** `.card p-5 sm:p-6` (rounded-card, border-line, bg-raised, shadow-card). Liste kartı:
  `card divide-y divide-line overflow-hidden`.
- **Liste satırı:** `flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-fg/[0.04]`; ikon `text-accent-ink`,
  başlık `text-fg font-medium`, alt satır `text-xs text-fg-subtle`, sonda `ChevronRight text-fg-subtle`.
  Kartın tamamı bağlantıysa: `after:absolute after:inset-0` deseni (panel `TripList`).
- **Boş durum:** `<EmptyState icon={Route}>Henüz yolculuk yok.</EmptyState>` (tek satır) veya
  `<EmptyState icon={Route} title="İlk rotanı çiz" action={<Button variant="accent" size="sm">…</Button>}>açıklama</EmptyState>`.
- **Form:** `<Field>`, `<SelectField>`, `<TextareaField>` (`src/components/ui/field.tsx`); özel alanlar için
  `inputClass(error, "h-12 px-4")` ve `labelClass`. Form `space-y-4`, iki sütun `grid gap-4 sm:grid-cols-2`.
  Kaydet: `<SubmitButton>` (primary) ya da ikincil eylemler için `variant="secondary"`.
- **Düğmeler:** `primary` (fg dolgu), `accent` (amber; ekran başına bir ana çağrı), `secondary`, `ghost`, `danger`.
  Renkleri `.btn-*` bileşen sınıflarında olduğu için `className` ile verilen `bg-*/text-*` her zaman kazanır
  (tailwind-merge yok; `!` gerekmez). Rozet: `<Badge tone="neutral|accent|success|danger">` (aynı kural).
- **Uyarı:** `<Alert tone="info|success|error">`.
- **Yüzen panel:** `bg-overlay border border-line shadow-[var(--shadow-overlay)]`; camsı: `.glass`.
- **Tema seçici:** `<ThemePicker />` (Ayarlar → Görünüm), `<ThemePicker compact />` (Diğer).

## 5. Haritalar

Haritayı `<ThemedMapStyle styleUrl={styleUrl}>{(mapStyle, theme) => <MapView mapStyle={mapStyle} …/>}</ThemedMapStyle>`
ile sarın (zaten sarılı: 8 harita). Stil, haritanın bulunduğu yerin hesaplanmış `color-scheme`'inden seçilir:
koyu yüzeyde OpenFreeMap `dark`, aydınlıkta `liberty` (`src/lib/maps/style.ts`). Geçiş kuralı altındaki
taşınmamış sayfalarda harita açık kalır; sayfayı `data-themed` yaptığınız an koyu temada koyu haritaya geçer.
**Bu yüzden sayfayı taşırken katman renklerini de `theme` argümanına göre seçin:** koyu haritada mürekkep
(`#0e1726`) rota çizgisi görünmez — `#f7f5f0` kenar + amber/açık çizgi kullanın; işaretlerin beyaz çerçevesi kalabilir.
PDF dışa aktarma her zaman açık stil kullanır.

## 6. Yapın / yapmayın

- Bileşenlerde sabit hex/rgb yazmayın (SVG dahil); token ya da `var(--color-…)` kullanın. İstisna: marka
  renkleri (Google "G"), harita boya ifadeleri (`theme`'e göre seçin).
- Yüzeylerde `text-paper`/`text-ink-*` kullanmayın; koyu/aydınlık görsel üzerindeki yazı gibi gerçekten sabit
  durumlarda tema adası (`data-theme="dark"`) kullanın.
- Amber yazı için `text-accent-ink`, büyük vurgu için `text-accent-glow`; `text-accent` yazı rengi değildir.
- Devre dışı öğeler: `opacity-60` + `text-fg-subtle`; tek bilgi taşıyıcısı renk olmasın.
- Her değişiklikte iki temayı da kontrol edin: çerez `rovia-theme=light|dark` ya da Ayarlar → Görünüm.
  Playwright: `context.addCookies([{ name: "rovia-theme", value: "light", url }])`, 390×844 ve 1440×900.
- e2e seçicilerini (rol, ad, `data-testid`) koruyun; `e2e/mobile-layout.spec.ts` 360 px'te yatay taşma kabul etmez.

## 7. Mekanizma (başvuru)

- `src/lib/theme/theme.ts`: çerez adı, `THEME_SCRIPT` (ilk boyamadan önce `<head>`'de çalışır; `data-theme`,
  `data-theme-pref`, `<meta name="theme-color">` ayarlar), `setThemePreference()`, `subscribeTheme()`.
- Kök düzen çerez OKUMAZ (cacheComponents/PPR statik kalır). `ThemeSync` sistem değişimini izler ve geliştirmedeki
  Strict Mode sıfırlamasını düzeltir. Hook'lar: `useThemePreference()`, `useResolvedTheme()` (`src/components/theme`).
- CSP: betik sabit bir satır içi dizgedir; mevcut `script-src 'unsafe-inline'` kapsamındadır (Next.js RSC betikleri
  için zaten gerekli; nonce PPR ile uyumsuz). Özet (hash) eklenmez: özet varken tarayıcılar `'unsafe-inline'`ı yok sayar.
- Tercih şimdilik yalnızca çerezdedir (cihaz başına); profilde tema sütunu yok.
