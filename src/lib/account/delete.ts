/** Hesap silme: istemci ve sunucunun ortak kullandığı saf yardımcılar. */

/** account_delete RPC'sinin beklediği onay ifadesi (birebir). */
export const DELETE_CONFIRM_PHRASE = "HESABIMI SİL";
/** Veritabanı sınırı 15 dk; fotoğraf silme süresi için 2 dk pay bırakılır. */
export const REAUTH_WINDOW_MS = 13 * 60 * 1000;
export const MEDIA_BATCH_SIZE = 100;
/** Silme sonrası anasayfada bilgi şeridini gösteren adres. */
export const DELETED_REDIRECT = "/?hesap=silindi";
/** Yeniden giriş sonrası dönülecek yer (giriş sayfası `next` parametresini kullanır). */
export const REAUTH_REDIRECT = `/giris?next=${encodeURIComponent("/ayarlar#hesap")}`;

/**
 * Kullanıcının yazdığı ifadeyi normalleştirir: boşluklar, küçük harf ve Türkçe olmayan klavyeden
 * yazılmış "SIL" kabul edilir. Eşleşirse kanonik ifade, aksi hâlde null.
 */
export function normalizeConfirm(input: string): string | null {
  const v = input.trim().replace(/\s+/g, " ").toLocaleUpperCase("tr-TR");
  if (v === DELETE_CONFIRM_PHRASE) return DELETE_CONFIRM_PHRASE;
  if (v.replace(/İ/g, "I") === DELETE_CONFIRM_PHRASE.replace(/İ/g, "I")) return DELETE_CONFIRM_PHRASE;
  return null;
}

/** Son giriş, silme işlemini güvenle bitirmeye yetecek kadar yeni mi? */
export function isSignInFresh(lastSignInAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSignInAt) return false;
  const at = Date.parse(lastSignInAt);
  if (Number.isNaN(at)) return false;
  return now - at <= REAUTH_WINDOW_MS && at <= now + 60_000;
}

export type DeleteErrorCode = "reauth_required" | "media_remaining" | "confirm" | "media" | "failed";

/** RPC/PostgREST hata mesajını kullanıcıya gösterilecek koda çevirir. */
export function mapDeleteError(message: string | null | undefined): DeleteErrorCode {
  const m = message ?? "";
  if (m.includes("reauth_required")) return "reauth_required";
  if (m.includes("media_remaining")) return "media_remaining";
  if (m.includes("confirmation_required")) return "confirm";
  return "failed";
}

/** Bu cihazdaki ROVIA verilerini temizler (localStorage "rovia:" anahtarları + çevrimdışı GPS kuyruğu). */
export function clearLocalRoviaData(storage: Pick<Storage, "length" | "key" | "removeItem"> | null): number {
  if (!storage) return 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith("rovia:")) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}
