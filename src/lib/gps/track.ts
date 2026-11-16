import { decodePolyline, encodePolyline, simplifyPath, type LatLng } from "@/lib/geo";

/** Bölümler arası ayraç: polyline alfabesi (ASCII 63–126) boşluk içermez. */
const SEP = " ";

/**
 * Kaydedilen izi, bölümleri koruyarak tek metne çevirir.
 * Toplam nokta sayısı maxPoints'i aşmayacak şekilde, en küçük toleranstan başlayarak sadeleştirir.
 */
export function encodeTrack(paths: LatLng[][], maxPoints = 4000): string {
  const nonEmpty = paths.filter((p) => p.length > 0);
  let tolerance = 2;
  let simplified = nonEmpty.map((p) => simplifyPath(p, tolerance));
  while (simplified.reduce((n, p) => n + p.length, 0) > maxPoints && tolerance < 5000) {
    tolerance *= 1.6;
    simplified = nonEmpty.map((p) => simplifyPath(p, tolerance));
  }
  return simplified.map((p) => encodePolyline(p)).join(SEP);
}

export function decodeTrack(encoded: string | null | undefined): LatLng[][] {
  if (!encoded) return [];
  return encoded
    .split(SEP)
    .filter(Boolean)
    .map((part) => decodePolyline(part))
    .filter((p) => p.length > 0);
}
