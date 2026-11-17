/**
 * Türkçe ondalık sayı: "6,4" → 6.4; "1.234,5" → 1234.5; "1.250" → 1250 (binlik ayırıcı);
 * "6.4" → 6.4 (nokta tek ve 3 haneli grup değilse ondalık). Boş/geçersiz → null.
 */
export function parseDecimalTR(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/\s+/g, "").replace(/(TL|₺|km|L|kWh)$/i, "");
  if (!s) return null;
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Son görülen ayırıcı ondalıktır
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    s = s.replace(",", ".");
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Sayıyı Türkçe biçimde yazar (giriş alanlarına geri koymak için; binlik ayırıcı yok). */
export function formatDecimalTR(n: number | null | undefined, maxFraction = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toLocaleString("tr-TR", { maximumFractionDigits: maxFraction, useGrouping: false });
}

const tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
export const formatTL = (n: number) => `${tl.format(Math.round(n))} TL`;
export const formatAmount = (n: number, digits = 1) => n.toLocaleString("tr-TR", { maximumFractionDigits: digits });
