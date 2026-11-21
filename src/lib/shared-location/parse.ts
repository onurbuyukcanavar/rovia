/**
 * Paylaşılan konum ayrıştırıcı — saf TypeScript, ağ isteği yapmaz (tarayıcı ve sunucuda aynı).
 *
 * Girdi herhangi bir metin olabilir: WhatsApp mesajının tamamı (metin + bağlantı), bir harita bağlantısı,
 * `geo:` URI'si ya da düz koordinat. Sonuç:
 *   - point:   koordinat bulundu (varsa yer adıyla)
 *   - query:   yalnızca yer adı/adres var → sunucuda adres araması gerekir
 *   - resolve: kısa bağlantı (maps.app.goo.gl …) → sunucuda yönlendirmeler izlenerek çözülmeli
 *   - null:    konum yok
 *
 * Desteklenenler: Google Haritalar (tüm uzun biçimler + kısa bağlantılar), WhatsApp konum mesajları,
 * Apple Haritalar, Yandex Haritalar (boylam,enlem sırası!), OpenStreetMap, HERE, Waze (geohash dahil),
 * Bing, `geo:` URI'leri, ondalık / Türkçe virgüllü / DMS (41°00'29.5"N) koordinatlar, ROVIA'nın kendi bağlantıları.
 */

export type LocationSource =
  | "google" | "apple" | "yandex" | "osm" | "here" | "waze" | "bing" | "geo" | "rovia" | "coordinates" | "link";

export type SharedPoint = {
  kind: "point";
  lat: number;
  lng: number;
  label: string | null;
  source: LocationSource;
  /** Koordinat yerin kendisi değil, harita görünümünün merkezi (ör. yalnızca @lat,lng) */
  approximate: boolean;
};
export type SharedQuery = { kind: "query"; query: string; source: LocationSource };
export type SharedResolve = { kind: "resolve"; url: string; source: LocationSource };
export type ParsedLocation = SharedPoint | SharedQuery | SharedResolve;

/** Ayrıştırılan en uzun girdi (WhatsApp mesajları kısa; uzun metinlerde düzenli ifade maliyeti sınırlanır). */
export const MAX_INPUT = 4000;
const MAX_LABEL = 200;
const MAX_QUERY = 200;

// ------------------------------------------------------------------ Yardımcılar

const round6 = (n: number) => Math.round(n * 1e6) / 1e6 + 0; // +0: -0 → 0

/** Geçerli aralıktaysa 6 basamağa yuvarlanmış nokta. 0,0 (Null Island) yalnızca açıkça izin verilince. */
export function validPoint(lat: number, lng: number, allowZero = false): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const p = { lat: round6(lat), lng: round6(lng) };
  if (!allowZero && p.lat === 0 && p.lng === 0) return null;
  return p;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s.replace(/\+/g, " ");
  }
}

function cleanLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.replace(/\s+/g, " ").trim();
  if (!v || v.length < 2) return null;
  // Koordinat biçimindeki "ad" ad değildir
  if (parseCoordinatePair(v)) return null;
  return v.slice(0, MAX_LABEL);
}

function cleanQuery(s: string | null | undefined): string | null {
  const v = cleanLabel(s);
  if (!v) return null;
  // "Konumum", "Current Location" gibi göreli sorgular adrese çevrilemez
  if (/^(current location|my location|konumum|mevcut konum|geçerli konum)$/i.test(v)) return null;
  return v.slice(0, MAX_QUERY);
}

const point = (p: { lat: number; lng: number }, source: LocationSource, label: string | null = null, approximate = false): SharedPoint =>
  ({ kind: "point", lat: p.lat, lng: p.lng, label: cleanLabel(label), source, approximate });

const query = (q: string | null | undefined, source: LocationSource): SharedQuery | null => {
  const v = cleanQuery(q);
  return v ? { kind: "query", query: v, source } : null;
};

// ------------------------------------------------------------------ Düz koordinat

const DEC = String.raw`[-+−]?\d{1,3}(?:\.\d+)?`;
/** "41.0082, 28.9784" · "41.0082 28.9784" · "41.0082;28.9784" (yalnızca nokta ondalıklı) */
const DECIMAL_PAIR = new RegExp(String.raw`(?<![\w.,-])(${DEC})\s*(?:,|;|\s)\s*(${DEC})(?![\w.]|,\d)`);
/** Türkçe virgüllü ondalık: "41,0082 28,9784" · "41,0082; 28,9784" · "41,0082, 28,9784" (en az 3 ondalık hane) */
const COMMA_PAIR = /(?<![\w.,])([-+−]?\d{1,3},\d{3,})\s*(?:;\s*|,\s+|\s+)([-+−]?\d{1,3},\d{3,})(?![\w.,])/;

const num = (s: string) => Number(s.replace("−", "-").replace(",", "."));

/**
 * DMS ve yarım küre harfli biçimler: 41°00'29.5"N 28°58'42.2"E · N 41° 0.492' E 28° 58.703' ·
 * 41.0082° K, 28.9784° D (Türkçe: Kuzey/Güney/Doğu/Batı) · 41.0082N 28.9784E
 */
const DMS_PART = String.raw`(?:([NSEWKGDB])\s*)?([-+−]?\d{1,3}(?:[.,]\d+)?)\s*(?:(°|º|˚|deg\b)\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′’ʹ]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*(?:"|″|”|''|′′)\s*)?)?([NSEWKGDB](?![a-zçğıöşü]))?`;
const DMS_PAIR = new RegExp(`${DMS_PART}[\\s,;/]*${DMS_PART}`, "gi");

type Axis = "lat" | "lng" | null;
const axisOf = (h: string | undefined): Axis => {
  if (!h) return null;
  const c = h.toUpperCase();
  return c === "N" || c === "S" || c === "K" || c === "G" ? "lat" : "lng";
};
const signOf = (h: string | undefined) => (h && /[SWGB]/i.test(h) ? -1 : 1);

function dmsValue(deg: string, min: string | undefined, sec: string | undefined, hemi: string | undefined): number | null {
  const d = num(deg);
  const m = min ? num(min) : 0;
  const s = sec ? num(sec) : 0;
  if (m >= 60 || s >= 60) return null;
  const abs = Math.abs(d) + m / 60 + s / 3600;
  const negative = d < 0 || /^[-−]/.test(deg);
  return (negative ? -abs : abs) * signOf(hemi);
}

function parseDms(text: string): { lat: number; lng: number } | null {
  for (const m of text.matchAll(DMS_PAIR)) {
    const r = dmsFromMatch(m);
    if (r) return r;
  }
  return null;
}

function dmsFromMatch(m: RegExpMatchArray): { lat: number; lng: number } | null {
  const [, h1a, d1, deg1, m1, s1, h1b, h2a, d2, deg2, m2, s2, h2b] = m;
  const hemi1 = h1a ?? h1b;
  const hemi2 = h2a ?? h2b;
  // DMS sayılması için her iki parçada derece işareti ya da yarım küre harfi olmalı (aksi hâlde düz sayı çiftidir)
  if (!(deg1 || hemi1) || !(deg2 || hemi2)) return null;
  const a = dmsValue(d1, m1, s1, hemi1);
  const b = dmsValue(d2, m2, s2, hemi2);
  if (a === null || b === null) return null;
  const ax1 = axisOf(hemi1);
  const ax2 = axisOf(hemi2);
  if (ax1 && ax2 && ax1 === ax2) return null;
  // Harf yoksa sıra enlem, boylam; tek harf varsa diğeri ona göre
  const firstIsLng = ax1 === "lng" || ax2 === "lat";
  return firstIsLng ? { lat: b, lng: a } : { lat: a, lng: b };
}

/** Metindeki ilk koordinat çifti (enlem, boylam sırasıyla). */
export function parseCoordinatePair(text: string, { allowZero = false } = {}): { lat: number; lng: number } | null {
  const t = text.normalize("NFC");
  const dms = parseDms(t);
  if (dms) return validPoint(dms.lat, dms.lng, allowZero);
  let m = t.match(DECIMAL_PAIR);
  if (m) {
    // Ondalıksız tamsayı çiftleri ("10, 15") yalnızca metnin tamamıysa koordinat sayılır
    // ve "41,0" gibi boşluksuz virgülle yazılmamışsa (Türkçe ondalık olabilir: 41.0)
    const integers = !m[1].includes(".") && !m[2].includes(".");
    const ambiguous = integers && /^\s*[-+−]?\d+,\d+\s*$/.test(m[0]);
    if (!ambiguous && (!integers || t.trim() === m[0].trim())) {
      const p = validPoint(num(m[1]), num(m[2]), allowZero);
      if (p) return p;
    }
  }
  m = t.match(COMMA_PAIR);
  if (m) return validPoint(num(m[1]), num(m[2]), allowZero);
  return null;
}

/** "41.0,29.0" ya da "41.0, 29.0" biçimindeki parametre (yalnızca koordinat, başka metin yok). */
function exactPair(v: string | null | undefined, order: "latlng" | "lnglat" = "latlng"): { lat: number; lng: number } | null {
  if (!v) return null;
  const m = v.trim().match(/^([-+]?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return order === "latlng" ? validPoint(a, b) : validPoint(b, a);
}

// ------------------------------------------------------------------ Bağlantı çıkarma

/** Metindeki adayları sırasıyla: http(s) bağlantıları, geo: URI'leri ve şemasız bilinen harita adresleri. */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  const re = /\b(?:https?:\/\/|geo:|google\.navigation:)[^\s<>"'`]+|\b(?:maps\.app\.goo\.gl|goo\.gl\/maps|share\.google|g\.co\/kgs|maps\.google\.[a-z.]{2,6}|(?:www\.)?google\.[a-z.]{2,6}\/maps|maps\.apple\.com|maps\.apple|yandex\.[a-z.]{2,6}\/maps|(?:www\.)?openstreetmap\.org|osm\.org|(?:www\.)?waze\.com|(?:share|wego)\.here\.com|(?:www\.)?bing\.com\/maps)\/[^\s<>"'`]*/gi;
  for (const m of text.matchAll(re)) {
    let s = m[0];
    // geo: etiketi boşluk içerebilir: geo:41,29?q=41,29(Galata Kulesi)
    if (/^geo:/i.test(s) && s.includes("(") && !s.includes(")")) {
      const rest = text.slice(m.index! + s.length);
      const close = rest.indexOf(")");
      if (close >= 0 && close < 200 && !rest.slice(0, close).includes("\n")) s += rest.slice(0, close + 1);
    }
    out.push(trimTrailing(s));
  }
  return out;
}

/** Cümle sonundaki noktalama bağlantıya dahil değildir; dengeli parantez korunur. */
function trimTrailing(s: string): string {
  let v = s;
  for (;;) {
    const last = v.at(-1);
    if (!last) return v;
    if (".,;:!?»«\"'”’…".includes(last)) {
      v = v.slice(0, -1);
      continue;
    }
    if (last === ")" && (v.match(/\(/g)?.length ?? 0) < (v.match(/\)/g)?.length ?? 0)) {
      v = v.slice(0, -1);
      continue;
    }
    return v;
  }
}

function toUrl(raw: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ Sağlayıcılar

const hostOf = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
const GOOGLE_TLD = String.raw`google\.[a-z]{2,3}(?:\.[a-z]{2})?`;
const isGoogleHost = (h: string) => new RegExp(`^(?:maps\\.)?${GOOGLE_TLD}$`).test(h);

/** Sunucuda yönlendirmesi izlenerek çözülmesi gereken kısa bağlantı mı (yalnızca bilinen kısaltıcılar). */
export function isShortLink(u: URL): boolean {
  const h = hostOf(u);
  if (h === "maps.app.goo.gl" || h === "share.google") return u.pathname.length > 1;
  if (h === "goo.gl") return /^\/maps\/./.test(u.pathname) || /^\/app\/maps\/./.test(u.pathname);
  if (h === "g.co") return /^\/kgs\/./.test(u.pathname);
  if (h === "maps.apple") return /^\/p\/./.test(u.pathname);
  if (/^yandex\.[a-z.]+$/.test(h) || /^maps\.yandex\.[a-z.]+$/.test(h)) return /\/maps\/-\/./.test(u.pathname) || /^\/-\/./.test(u.pathname);
  return false;
}

/** Google: "lat,lng", "loc:lat,lng", "lat,lng (Ad)", "Ad@lat,lng" ya da yer adı. */
function googleQuery(v: string | null, source: LocationSource = "google"): ParsedLocation | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^loc:\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)(?:\s*\((.+)\))?$/i);
  if (m) {
    const p = validPoint(Number(m[1]), Number(m[2]));
    return p ? point(p, source, m[3]) : null;
  }
  m = s.match(/^([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*(?:\((.+)\))?$/);
  if (m) {
    const p = validPoint(Number(m[1]), Number(m[2]));
    return p ? point(p, source, m[3]) : null;
  }
  m = s.match(/^(.+?)\s*@\s*([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)$/);
  if (m) {
    const p = validPoint(Number(m[2]), Number(m[3]));
    if (p) return point(p, source, m[1]);
  }
  return query(s, source);
}

function parseGoogle(u: URL): ParsedLocation | null {
  const href = safeDecode(u.pathname + u.search + u.hash);
  const params = u.searchParams;
  const path = u.pathname.split("/").filter(Boolean).map(safeDecode);
  const mapsIdx = path.indexOf("maps");
  const segs = mapsIdx >= 0 ? path.slice(mapsIdx + 1) : path;

  // Yer adı: /maps/place/<Ad>/…
  const placeIdx = segs.indexOf("place");
  const placeName = placeIdx >= 0 ? cleanLabel(segs[placeIdx + 1]?.startsWith("@") ? null : segs[placeIdx + 1]) : null;

  // 1) En kesin: yerin işaretçisi (!3d enlem !4d boylam); son eşleşme hedef yerdir
  const marks = [...href.matchAll(/!3d([-+]?\d{1,3}(?:\.\d+)?)!4d([-+]?\d{1,3}(?:\.\d+)?)/g)];
  if (marks.length) {
    const last = marks.at(-1)!;
    const p = validPoint(Number(last[1]), Number(last[2]));
    if (p) return point(p, "google", placeName);
  }

  // 2) Sorgu parametreleri (hedef öncelikli)
  for (const key of ["q", "query", "destination", "daddr"]) {
    const v = params.get(key);
    if (!v) continue;
    // daddr "A to:B" biçiminde birden çok hedef taşıyabilir: sonuncusu varış
    const last = key === "daddr" ? v.split(/\s+to:/).at(-1)! : v;
    const r = googleQuery(last);
    if (r?.kind === "point") return placeName && !r.label ? { ...r, label: placeName } : r;
    if (r?.kind === "query") {
      // Sorgu bir yer adıysa ve bağlantıda koordinat da varsa koordinat + ad
      const at = href.match(/@([-+]?\d{1,3}(?:\.\d+)?),([-+]?\d{1,3}(?:\.\d+)?)/);
      const ll = exactPair(params.get("ll")) ?? exactPair(params.get("center")) ?? (at ? validPoint(Number(at[1]), Number(at[2])) : null);
      if (ll && key !== "destination" && key !== "daddr") return point(ll, "google", r.query, true);
      return r;
    }
  }

  // 3) Yol: /maps/search/<koordinat|ad>/ · /maps/place/<koordinat>/ · /maps/dir/<A>/<B>/
  const pathTarget = (() => {
    const i = segs.findIndex((s) => s === "search" || s === "place" || s === "dir");
    if (i < 0) return null;
    const rest = segs.slice(i + 1).filter((s) => !s.startsWith("@") && !s.startsWith("data=") && !s.startsWith("am="));
    return segs[i] === "dir" ? rest.at(-1) ?? null : rest[0] ?? null;
  })();
  if (pathTarget) {
    const r = googleQuery(pathTarget);
    if (r?.kind === "point") return r;
  }

  // 4) ll / sll / center parametresi
  for (const key of ["ll", "sll", "center"]) {
    const p = exactPair(params.get(key));
    if (p) return point(p, "google", placeName ?? (pathTarget ? cleanLabel(pathTarget) : null), key !== "ll" || !placeName);
  }

  // 5) Harita görünümü merkezi: @41.0,28.9,15z — yer adı varsa yerin yakını, yoksa yalnızca görünüm
  const at = href.match(/@([-+]?\d{1,3}(?:\.\d+)?),([-+]?\d{1,3}(?:\.\d+)?)/);
  if (at) {
    const p = validPoint(Number(at[1]), Number(at[2]));
    const label = placeName ?? (pathTarget ? cleanLabel(pathTarget) : null);
    if (p) return point(p, "google", label, true);
  }

  // 6) Yalnızca yer adı: /maps/place/Ölüdeniz · /maps/search/Ölüdeniz
  if (pathTarget) return query(pathTarget, "google");
  // google.com/search?q=… (g.co/kgs çözümlemesinin sonucu)
  if (segs[0] === "search" || u.pathname === "/search") return query(params.get("q"), "google");
  return null;
}

function parseApple(u: URL): ParsedLocation | null {
  const p = u.searchParams;
  const label = p.get("name") ?? p.get("q") ?? p.get("address");
  for (const key of ["coordinate", "ll", "daddr", "destination"]) {
    const c = exactPair(p.get(key));
    if (c) return point(c, "apple", key === "daddr" || key === "destination" ? (p.get("q") ?? p.get("name")) : label);
  }
  const target = p.get("daddr") ?? p.get("destination") ?? p.get("address") ?? p.get("q") ?? p.get("name");
  if (target) {
    const sll = exactPair(p.get("sll"));
    // q yalnızca arama terimiyse ve sll (arama merkezi) varsa: yaklaşık konum + ad
    if (sll && !p.get("daddr") && !p.get("address")) return point(sll, "apple", target, true);
    return query(target, "apple");
  }
  const sll = exactPair(p.get("sll")) ?? exactPair(p.get("center"));
  return sll ? point(sll, "apple", null, true) : null;
}

function parseYandex(u: URL): ParsedLocation | null {
  const p = u.searchParams;
  const label = p.get("text");
  // Yandex'te sıra BOYLAM,ENLEM'dir (rtext hariç)
  const what = p.get("whatshere[point]");
  if (what) {
    const c = exactPair(what, "lnglat");
    if (c) return point(c, "yandex", label);
  }
  const pt = p.get("pt");
  if (pt) {
    // pt=lng,lat[,stil][~lng,lat…] → ilk işaret
    const [lng, lat] = pt.split("~")[0].split(",");
    const c = validPoint(Number(lat), Number(lng));
    if (c) return point(c, "yandex", label);
  }
  const rtext = p.get("rtext");
  if (rtext) {
    // rtext=enlem,boylam~enlem,boylam → son nokta varış
    const c = exactPair(rtext.split("~").filter(Boolean).at(-1));
    if (c) return point(c, "yandex", label);
  }
  const ll = exactPair(p.get("ll"), "lnglat");
  if (ll) return point(ll, "yandex", label, true);
  return query(label, "yandex");
}

function parseOsm(u: URL): ParsedLocation | null {
  const p = u.searchParams;
  const m = validPoint(Number(p.get("mlat")), Number(p.get("mlon")));
  if (p.get("mlat") && p.get("mlon") && m) return point(m, "osm");
  const route = p.get("route");
  if (route) {
    // route=enlem,boylam;enlem,boylam → varış
    const c = exactPair(route.split(";").filter(Boolean).at(-1)?.replace(/%2C/gi, ","));
    if (c) return point(c, "osm");
  }
  const hash = u.hash.match(/map=\d{1,2}(?:\.\d+)?\/([-+]?\d{1,3}(?:\.\d+)?)\/([-+]?\d{1,3}(?:\.\d+)?)/);
  if (hash) {
    const c = validPoint(Number(hash[1]), Number(hash[2]));
    if (c) return point(c, "osm", null, true);
  }
  const lat = p.get("lat");
  const lon = p.get("lon");
  if (lat && lon) {
    const c = validPoint(Number(lat), Number(lon));
    if (c) return point(c, "osm", null, true);
  }
  const q = p.get("query");
  if (q) {
    const c = parseCoordinatePair(q);
    return c ? point(c, "osm") : query(q, "osm");
  }
  return null;
}

function parseHere(u: URL): ParsedLocation | null {
  // share.here.com/l/41.0,29.0,Ad · wego.here.com/directions/drive/…/Ad:41.0,29.0 · ?map=41.0,29.0,15
  const path = safeDecode(u.pathname);
  let m = path.match(/\/l\/([-+]?\d{1,3}(?:\.\d+)?),([-+]?\d{1,3}(?:\.\d+)?)(?:,([^/?]+))?/);
  if (m) {
    const c = validPoint(Number(m[1]), Number(m[2]));
    if (c) return point(c, "here", m[3]);
  }
  m = path.match(/\/directions\/[^/]+\/(?:.*\/)?(?:([^/:]*):)?([-+]?\d{1,3}(?:\.\d+)?),([-+]?\d{1,3}(?:\.\d+)?)\/?$/);
  if (m) {
    const c = validPoint(Number(m[2]), Number(m[3]));
    if (c) return point(c, "here", m[1]);
  }
  const map = u.searchParams.get("map")?.split(",");
  if (map && map.length >= 2) {
    const c = validPoint(Number(map[0]), Number(map[1]));
    if (c) return point(c, "here", null, true);
  }
  return null;
}

const GEOHASH = "0123456789bcdefghjkmnpqrstuvwxyz";
/** Geohash → hücre merkezi (Waze kısa bağlantıları: waze.com/ul/h<geohash>). */
export function decodeGeohash(hash: string): { lat: number; lng: number } | null {
  if (!hash || hash.length < 5 || hash.length > 12) return null;
  const lat = [-90, 90];
  const lng = [-180, 180];
  let even = true;
  for (const ch of hash.toLowerCase()) {
    const v = GEOHASH.indexOf(ch);
    if (v < 0) return null;
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((v >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return validPoint((lat[0] + lat[1]) / 2, (lng[0] + lng[1]) / 2);
}

function parseWaze(u: URL): ParsedLocation | null {
  const p = u.searchParams;
  const ll = exactPair(p.get("ll")) ?? exactPair(p.get("latlng"));
  if (ll) return point(ll, "waze", p.get("q"));
  // live-map/directions?to=ll.41.0,29.0 · place.… (yer kimliği)
  const to = p.get("to") ?? p.get("from");
  const m = to?.match(/^ll\.([-+]?\d{1,3}(?:\.\d+)?),([-+]?\d{1,3}(?:\.\d+)?)/);
  if (m) {
    const c = validPoint(Number(m[1]), Number(m[2]));
    if (c) return point(c, "waze");
  }
  const gh = u.pathname.match(/\/ul\/h([0-9b-hjkmnp-z]{5,12})\/?$/i);
  if (gh) {
    const c = decodeGeohash(gh[1]);
    if (c) return point(c, "waze", null, true);
  }
  return query(p.get("q"), "waze");
}

function parseBing(u: URL): ParsedLocation | null {
  const p = u.searchParams;
  // sp=point.41.0_29.0_Ad · rtp=~pos.41.0_29.0_Ad (son nokta varış)
  const pos = [...safeDecode(`${p.get("rtp") ?? ""}~${p.get("sp") ?? ""}`).matchAll(/(?:pos|point)\.([-+]?\d{1,3}(?:\.\d+)?)_([-+]?\d{1,3}(?:\.\d+)?)(?:_([^~_]+))?/g)];
  const lastPos = pos.at(-1);
  if (lastPos) {
    const c = validPoint(Number(lastPos[1]), Number(lastPos[2]));
    if (c) return point(c, "bing", lastPos[3]);
  }
  const cp = p.get("cp")?.match(/^([-+]?\d{1,3}(?:\.\d+)?)~([-+]?\d{1,3}(?:\.\d+)?)$/);
  const q = p.get("where1") ?? p.get("q");
  if (cp) {
    const c = validPoint(Number(cp[1]), Number(cp[2]));
    if (c) return point(c, "bing", q, true);
  }
  return query(q, "bing");
}

function parseRovia(u: URL): ParsedLocation | null {
  const p = u.searchParams;
  const c = exactPair(p.get("konum")) ?? (p.get("lat") && p.get("lng") ? validPoint(Number(p.get("lat")), Number(p.get("lng"))) : null);
  if (c) return point(c, "rovia", p.get("ad") ?? p.get("label"));
  // /konum?text=… iç içe paylaşım
  const inner = p.get("text") ?? p.get("url") ?? p.get("q");
  return inner && inner.length < MAX_INPUT ? parseSharedLocation(inner) : null;
}

/** geo:lat,lng[,alt][;u=…]?q=lat,lng(Ad) · geo:0,0?q=adres · geo:lat,lng?z=17 */
export function parseGeoUri(raw: string): ParsedLocation | null {
  const m = raw.trim().match(/^geo:(?:\/\/)?([^?#]*)(?:\?([^#]*))?/i);
  if (!m) return null;
  const [lat, lng] = m[1].split(";")[0].split(",").map((s) => Number(safeDecode(s)));
  const base = Number.isFinite(lat) && Number.isFinite(lng) ? validPoint(lat, lng) : null;
  // q değerinde & ve ( ) kodlanmamış gelebilir: URLSearchParams yerine elle ayır
  const qMatch = (m[2] ?? "").match(/(?:^|&)q=(.*?)(?=&[a-z]+=|$)/i);
  const q = qMatch ? safeDecode(qMatch[1]).trim() : "";
  if (q) {
    const lm = q.match(/^([-+]?\d{1,3}(?:\.\d+)?)\s*,\s*([-+]?\d{1,3}(?:\.\d+)?)\s*(?:\((.*)\))?$/);
    if (lm) {
      const c = validPoint(Number(lm[1]), Number(lm[2]));
      if (c) return point(c, "geo", lm[3]);
    }
    // geo:lat,lng?q=Ad → nokta + ad; geo:0,0?q=Adres → adres araması
    if (base) return point(base, "geo", q);
    return query(q, "geo");
  }
  return base ? point(base, "geo") : null;
}

/** Tek bir bağlantıyı ayrıştırır. */
export function parseLocationUrl(raw: string): ParsedLocation | null {
  if (/^geo:/i.test(raw.trim())) return parseGeoUri(raw);
  // Android navigasyon isteği: google.navigation:q=41.0,29.0 · google.navigation:q=Ad+Soyad+Cd.
  const nav = raw.trim().match(/^google\.navigation:(?:\/\/)?\??(?:.*&)?q=([^&]+)/i);
  if (nav) return googleQuery(safeDecode(nav[1]));
  const u = toUrl(raw.trim());
  if (!u) return null;
  const h = hostOf(u);
  if (isShortLink(u)) {
    const source: LocationSource = /yandex/.test(h) ? "yandex" : h === "maps.apple" ? "apple" : "google";
    // Kısa bağlantılar her zaman https'e yükseltilir
    const url = new URL(u.href);
    url.protocol = "https:";
    return { kind: "resolve", url: url.href, source };
  }
  if (isGoogleHost(h) && (h.startsWith("maps.") || u.pathname.startsWith("/maps") || u.pathname === "/search" || u.pathname === "/")) {
    return parseGoogle(u);
  }
  if (h === "maps.apple.com" || h === "maps.apple" || h === "collections.apple.com") return parseApple(u);
  if (/^(?:maps\.)?yandex\.[a-z.]+$/.test(h)) return parseYandex(u);
  if (h === "openstreetmap.org" || h === "osm.org" || h.endsWith(".openstreetmap.org")) return parseOsm(u);
  if (/(?:^|\.)here\.com$/.test(h)) return parseHere(u);
  if (h === "waze.com" || h === "ul.waze.com") return parseWaze(u);
  if (h === "bing.com" && u.pathname.startsWith("/maps")) return parseBing(u);
  if (h === "roviaroad.com" || h === "rovia-seven.vercel.app" || h === "localhost") return parseRovia(u);
  // Bilinmeyen site: yalnızca açık lat/lng parametreleri
  const lat = u.searchParams.get("lat") ?? u.searchParams.get("latitude");
  const lng = u.searchParams.get("lng") ?? u.searchParams.get("lon") ?? u.searchParams.get("longitude");
  if (lat && lng) {
    const c = validPoint(Number(lat), Number(lng));
    if (c) return point(c, "link");
  }
  return null;
}

// ------------------------------------------------------------------ Giriş noktası

const RANK: Record<ParsedLocation["kind"], number> = { point: 0, resolve: 1, query: 2 };

/**
 * Herhangi bir metinden paylaşılan konum. Birden çok bağlantı varsa koordinat taşıyan öne geçer.
 * `allowQuery`: metin bağlantı/koordinat içermiyorsa (ör. /konum?q=Ölüdeniz) yer adı araması olarak döndür.
 */
export function parseSharedLocation(input: string | null | undefined, { allowQuery = false } = {}): ParsedLocation | null {
  if (!input) return null;
  const text = input.slice(0, MAX_INPUT).normalize("NFC").replace(/[‎‏‪-‮⁦-⁩]/g, "").trim();
  if (!text) return null;

  let best: ParsedLocation | null = null;
  for (const link of extractLinks(text)) {
    const r = parseLocationUrl(link);
    if (r && (!best || RANK[r.kind] < RANK[best.kind])) best = r;
    if (best?.kind === "point" && !best.approximate) break;
  }
  if (best?.kind === "point" || best?.kind === "resolve") return best;

  // Bağlantı dışındaki metinde koordinat (bağlantılar çıkarılarak: bağlantı içi sayılar tekrar okunmasın)
  const plain = text.replace(/\b(?:https?:\/\/|geo:|google\.navigation:)\S+/gi, " ");
  const explicit = /^\s*[-+]?0+(?:\.0+)?\s*[,;\s]\s*[-+]?0+(?:\.0+)?\s*$/.test(plain);
  const c = parseCoordinatePair(plain, { allowZero: explicit });
  if (c) return point(c, "coordinates");
  if (best) return best;

  if (allowQuery && !/[\n\r]/.test(text) && text.length <= MAX_QUERY && !/^[a-z]+:\/\//i.test(text)) return query(text, "coordinates");
  return null;
}

/** Konumun Google Haritalar bağlantısı ("Google Haritalar'da aç" yedeği). */
export const googleMapsUrl = (p: { lat: number; lng: number }) =>
  `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)}%2C${p.lng.toFixed(6)}`;

/** "41.008200, 28.978400" */
export const formatCoords = (p: { lat: number; lng: number }) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
