import type { Stop } from "@/lib/maps/types";
import { OSM_REF } from "./geo";

/**
 * Planlayıcıya taşınan yer: /planla?yer=<ref>&ad=<ad>&konum=<lat,lng>[&adres=…][&baslangic=konum]
 * baslangic=konum: başlangıç noktası kullanıcının o anki konumu (izin verilirse; ör. paylaşılan konumdan "Buraya rota oluştur").
 */
export type PlaceParam = { ref: string | null; name: string; lat: number; lng: number; address: string | null };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export function placeToSearchParams(p: PlaceParam, { fromCurrentLocation = false }: { fromCurrentLocation?: boolean } = {}): string {
  const q = new URLSearchParams();
  if (p.ref && OSM_REF.test(p.ref)) q.set("yer", p.ref);
  q.set("ad", p.name.slice(0, 200));
  q.set("konum", `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`);
  if (p.address) q.set("adres", p.address.slice(0, 300));
  if (fromCurrentLocation) q.set("baslangic", "konum");
  return q.toString();
}

/** ?baslangic=konum: planlayıcı açılınca başlangıç olarak cihaz konumu istenir. */
export const wantsCurrentOrigin = (params: Params) => one(params.baslangic) === "konum";

/** URL parametrelerinden durak; eksik ya da geçersizse null. */
export function stopFromSearchParams(params: Params): Stop | null {
  const name = one(params.ad)?.trim().slice(0, 200);
  const [lat, lng] = (one(params.konum) ?? "").split(",").map(Number);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const ref = one(params.yer);
  const validRef = ref && OSM_REF.test(ref) ? ref : null;
  return {
    id: validRef ?? `p${lat.toFixed(5)},${lng.toFixed(5)}`,
    label: name,
    address: one(params.adres)?.trim().slice(0, 500) || null,
    ref: validRef,
    location: { lat, lng },
  };
}
