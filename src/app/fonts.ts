import localFont from "next/font/local";

/**
 * Yazı tipleri next/font/local ile (fontsource dosyaları, yalnızca latin + latin-ext — Türkçe için yeterli).
 * Kazanımlar (önceki `@import "@fontsource-variable/*"` yerine):
 *  - Manrope (arayüz metni) <link rel=preload> ile CSS'ten önce indirilmeye başlar → metin daha erken son hâliyle çizilir.
 *  - Ölçüleri ayarlanmış yedek yazı tipi (size-adjust) → font değişiminde yerleşim kayması (CLS) olmaz.
 *  - Kiril/Yunan/Vietnam alt kümeleri için @font-face tanımı gönderilmez.
 * Her alt küme ayrı örnek: next/font/local tek örnekte unicode-range bölmeyi desteklemez; tarayıcı
 * karakteri kapsayan ilk aileyi kullanır (fontsource'un davranışıyla aynı).
 */
// Alt küme aralıkları (fontsource ile aynı). next/font değerleri sabit yazılmalı (değişken kullanılamaz).

const manropeLatin = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-manrope-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
  adjustFontFallback: "Arial",
});
const manropeLatinExt = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-ext-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-manrope-latin-ext",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
  adjustFontFallback: false,
});
// Newsreader yalnızca seyahatname metinlerinde → önceden yüklenmez (ilk boyamayı yavaşlatmasın)
const newsreaderLatin = localFont({
  src: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  preload: false,
  variable: "--font-newsreader-latin",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
  adjustFontFallback: "Times New Roman",
});
const newsreaderLatinExt = localFont({
  src: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-ext-wght-normal.woff2",
  weight: "200 800",
  display: "swap",
  preload: false,
  variable: "--font-newsreader-latin-ext",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
  adjustFontFallback: false,
});

export const fontVariables = [manropeLatin, manropeLatinExt, newsreaderLatin, newsreaderLatinExt].map((f) => f.variable).join(" ");
