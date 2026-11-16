const nf = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return "0 km";
  const km = meters / 1000;
  return `${km < 100 ? nf1.format(km) : nf.format(km)} km`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 dk";
  // Önce dakikaya yuvarla; aksi hâlde 3599 sn "60 dk", 7199 sn "1 sa 60 dk" olur
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} dk`;
  return m === 0 ? `${nf.format(h)} sa` : `${nf.format(h)} sa ${m} dk`;
}

export function formatCount(n: number): string {
  return nf.format(Number.isFinite(n) ? n : 0);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" });
}

/** Kronometre: 0:05:09, 12:41:00 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Saat (İstanbul): 09:41 */
export function formatTime(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
}

export function formatSpeed(kmh: number | null): string {
  return kmh === null ? "—" : `${kmh.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} km/sa`;
}
