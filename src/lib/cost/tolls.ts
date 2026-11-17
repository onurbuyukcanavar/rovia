import type { RouteOption, RouteStep } from "@/lib/maps/types";
import { garage } from "@/i18n/garage";
import { CROSSINGS, detectCrossings, type Crossing } from "./tariffs";
import type { TollItem } from "./types";

const T = garage.cost;

/** Adım metnindeki otoyol adları: "O-4", "Kuzey Marmara Otoyolu" (en fazla 2, tekrarsız). */
export function motorwayNames(instructions: string[]): string[] {
  const out: string[] = [];
  const add = (n: string) => {
    const v = n.trim().replace(/\s+/g, " ");
    if (v && !out.some((o) => o.toLocaleLowerCase("tr") === v.toLocaleLowerCase("tr"))) out.push(v);
  };
  for (const s of instructions) {
    for (const m of s.matchAll(/(?:^|[\s/(,])((?:[A-ZÇĞİÖŞÜ][\p{L}.'-]*\s){1,4}Otoyolu)/gu)) add(m[1]);
    for (const m of s.matchAll(/\b(O-\d{1,2})\b/g)) add(m[1]);
  }
  return out.slice(0, 2);
}

const matchesCrossing = (text: string) => CROSSINGS.some((c) => c.match.test(text));

function crossingItem(c: Crossing): TollItem {
  return { id: `x:${c.key}`, label: c.label, amount: c.amount, source: "reference", kind: "crossing", note: c.note };
}

/** Feribot adımından hat adı: "Eskihisar - Topçular feribotuna binin." → "Eskihisar - Topçular" */
export function ferryName(instruction: string): string | null {
  const m = instruction.match(/^(.+?)\s+feribot/i);
  const name = m?.[1]?.trim();
  return name && name.length <= 60 ? name : null;
}

type RouteLike = Pick<RouteOption, "hasToll" | "hasFerry"> & { tollBridges?: string[]; steps?: RouteStep[] };

/**
 * Rotadaki ücretli kalemler:
 * 1. Bilinen köprü/tüneller (referans tarifeli): istisna köprüler (tollBridges) + ücretli adımların metinleri.
 * 2. Ücretli otoyol kesimleri: ardışık ücretli adımlar gruplanır (tutar null — kullanıcı girer). Bilinen bir
 *    geçişe ait adımlar gruptan çıkarılır (çift sayım olmasın), grubu bölmez.
 * 3. Feribotlar: her feribot adımı ayrı kalem (tutar null).
 * Adım bilgisi yoksa hasToll/hasFerry bayraklarından genel kalemler üretilir.
 */
export function detectRouteTolls(route: RouteLike): TollItem[] {
  const steps = route.steps ?? [];
  const tollTexts = steps.filter((s) => s.toll && s.kind !== "ferry").map((s) => s.instruction);
  const crossings = detectCrossings([...(route.tollBridges ?? []), ...tollTexts]);
  const items: TollItem[] = crossings.map(crossingItem);

  const groups: RouteStep[][] = [];
  let current: RouteStep[] | null = null;
  for (const s of steps) {
    if (s.kind === "ferry" || !s.toll) {
      current = null;
      continue;
    }
    if (matchesCrossing(s.instruction)) continue; // geçiş ayrıca sayılıyor; grup sürer
    if (!current) groups.push((current = []));
    current.push(s);
  }
  groups.forEach((g, i) => {
    const km = Math.max(1, Math.round(g.reduce((sum, s) => sum + s.distanceMeters, 0) / 1000));
    const names = motorwayNames(g.map((s) => s.instruction));
    items.push({
      id: `m:${i}`, label: T.motorway(names.join(", ") || T.motorwayUnnamed, km), amount: null, source: "user",
      kind: "motorway", note: T.motorwayNote, km,
    });
  });
  if (!groups.length && route.hasToll && !steps.length) {
    items.push({ id: "m:generic", label: T.motorwayGeneric, amount: null, source: "user", kind: "motorway", note: T.motorwayNote });
  }

  const ferries = steps.filter((s) => s.kind === "ferry");
  ferries.forEach((s, i) => {
    items.push({ id: `f:${i}`, label: T.ferry(ferryName(s.instruction)), amount: null, source: "user", kind: "ferry", note: T.ferryNote });
  });
  if (!ferries.length && route.hasFerry) {
    items.push({ id: "f:generic", label: T.ferry(null), amount: null, source: "user", kind: "ferry", note: T.ferryNote });
  }
  return items;
}

/** Kaydedilmiş yolculuk (adım bilgisi yok): durak adları + kayıtlı bayraklar. */
export function tollsForSavedTrip(input: { names: string[]; hasToll: boolean; hasFerry: boolean }): TollItem[] {
  const items = detectCrossings(input.names).map(crossingItem);
  if (input.hasToll) items.push({ id: "m:generic", label: T.motorwayGeneric, amount: null, source: "user", kind: "motorway", note: T.motorwayNote });
  if (input.hasFerry) items.push({ id: "f:generic", label: T.ferry(null), amount: null, source: "user", kind: "ferry", note: T.ferryNote });
  return items;
}
