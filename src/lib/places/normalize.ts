/**
 * Arama için Türkçe metin normalleştirme: Türkçe büyük/küçük harf kuralları,
 * aksan ve Türkçe karakterlerin sadeleştirilmesi (ğ→g, ı→i...), noktalama → boşluk.
 * scripts/osm/extract.py içindeki normalize() ile birebir aynı sonucu üretmelidir
 * (ortak test vakaları: tests/fixtures/normalize-cases.json).
 */
const MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function normalizeForSearch(input: string): string {
  return input
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => MAP[c] ?? c)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
