/**
 * Köprü ve tünel geçiş ücretleri — REFERANS değerler (1. sınıf / otomobil, tek yön, KDV dahil).
 * Kaynak: KGM ve işletmeci duyurularına dayanan basın haberleri; 1 Temmuz 2026'dan itibaren geçerli tarife.
 * Bu değerler değişebilir; arayüzde her zaman tarihiyle "yaklaşık" olarak gösterilir ve kullanıcı değiştirebilir.
 * Otoyol (giriş–çıkış) ücretleri gişe çiftine göre değiştiği için burada yoktur; kullanıcı tutarı girer.
 */
export const TARIFF_DATE = "2026-07-01";
export const TARIFF_SOURCE = "KGM ve işletmeci tarifeleri (1 Temmuz 2026)";
export const TARIFF_SOURCE_URL = "https://www.kgm.gov.tr/Sayfalar/KGM/SiteTr/Otoyollar/OtoyolGecisUcretleri.aspx";

export type Crossing = {
  key: string;
  label: string;
  /** Rota adımlarındaki yol/yer adlarında aranır (büyük/küçük harf duyarsız) */
  match: RegExp;
  /** 1. sınıf ücret (TL) */
  amount: number;
  note?: string;
};

export const CROSSINGS: Crossing[] = [
  { key: "15temmuz", label: "15 Temmuz Şehitler Köprüsü", match: /15 temmuz|şehitler köprüsü|boğaziçi köprüsü/i, amount: 59,
    note: "Ücret yalnızca Avrupa→Asya yönünde alınır." },
  { key: "fsm", label: "Fatih Sultan Mehmet Köprüsü", match: /fatih sultan mehmet/i, amount: 59,
    note: "Ücret yalnızca Avrupa→Asya yönünde alınır." },
  { key: "yss", label: "Yavuz Sultan Selim Köprüsü", match: /yavuz sultan selim/i, amount: 110 },
  { key: "osmangazi", label: "Osmangazi Köprüsü", match: /osmangazi/i, amount: 1170 },
  { key: "canakkale1915", label: "1915 Çanakkale Köprüsü", match: /1915|çanakkale köprüsü/i, amount: 1170 },
  { key: "avrasya", label: "Avrasya Tüneli", match: /avrasya/i, amount: 330, note: "Gece (00.00–04.59) %50 indirimli: 165 TL." },
];

/** Rota adım adlarında geçen bilinen köprü/tünelleri (her biri bir kez) bulur. */
export function detectCrossings(names: string[]): Crossing[] {
  const text = names.join(" | ");
  return CROSSINGS.filter((c) => c.match.test(text));
}

/** Fiyatların "güncel olmayabilir" uyarısı için: referans tarihinden bu yana geçen gün */
export function daysSince(isoDate: string, now = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(isoDate)) / 86_400_000);
}
