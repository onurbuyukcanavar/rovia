const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");

/** ISO zaman → <input type="datetime-local"> değeri (tarayıcının yerel saatiyle). Geçersiz/boş için "". */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * <input type="datetime-local"> değeri → saat dilimi farkı içeren ISO metni (ör. 2026-05-01T14:30:00+03:00).
 * Boş ya da geçersiz değer için null.
 */
export function localInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, da, h, mi, s] = m;
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s ?? 0));
  if (Number.isNaN(d.getTime()) || d.getMonth() !== Number(mo) - 1) return null;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${y}-${mo}-${da}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}
