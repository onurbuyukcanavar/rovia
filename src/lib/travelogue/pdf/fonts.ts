import { Font } from "@react-pdf/renderer";

/** PDF yazı aileleri (public/fonts; Türkçe karakterlerin tamamını içerir). */
export const SERIF = "Newsreader";
export const SANS = "Manrope";

let registeredBase: string | null = null;

/**
 * Yazı tiplerini kaydeder. `base`: tarayıcıda "/fonts", Node'da yerel klasör yolu.
 * Heceleme kapatılır: react-pdf'in İngilizce heceleme kuralları Türkçe sözcükleri yanlış böler.
 */
export function registerBookFonts(base = "/fonts") {
  if (registeredBase === base) return;
  const src = (f: string) => `${base.replace(/\/$/, "")}/${f}`;
  Font.register({
    family: SERIF,
    fonts: [
      { src: src("Newsreader_400Regular.ttf"), fontWeight: 400 },
      { src: src("Newsreader_400Regular_Italic.ttf"), fontWeight: 400, fontStyle: "italic" },
      { src: src("Newsreader_600SemiBold.ttf"), fontWeight: 600 },
      { src: src("Newsreader_600SemiBold_Italic.ttf"), fontWeight: 600, fontStyle: "italic" },
    ],
  });
  Font.register({
    family: SANS,
    fonts: [
      { src: src("Manrope_400Regular.ttf"), fontWeight: 400 },
      { src: src("Manrope_700Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registeredBase = base;
}
