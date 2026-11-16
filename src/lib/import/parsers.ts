import { strFromU8, unzipSync } from "fflate";
import { coordsFromGoogleUrl, nameFromGoogleUrl } from "./google-url";

/**
 * Konum dosyası ayrıştırıcıları. Tarayıcıda çalışır: dosya sunucuya yüklenmez, yalnızca
 * ayrıştırılmış yer listesi (ad, koordinat, not) kaydedilir.
 *
 * Desteklenen biçimler:
 *  - Google Takeout ZIP (Saved/*.csv listeleri, Maps (your places)/Saved Places.json, *.kml)
 *  - GeoJSON (Takeout "Saved Places.json" ve genel FeatureCollection)
 *  - Google Takeout liste CSV'si (Title, Note, URL…) ve genel CSV (ad, enlem, boylam)
 *  - KML / KMZ (Google My Maps, Google Earth) · GPX yol noktaları (wpt)
 */
export type ImportSource = "google_takeout" | "kml" | "gpx" | "csv";

export type ParsedPlace = {
  name: string;
  lat: number | null;
  lng: number | null;
  address?: string | null;
  notes?: string | null;
  sourceRef?: string | null;
  listName?: string | null;
  listType?: "favorite" | "want_to_go";
};

export type ParsedFile = { source: ImportSource; fileName: string; places: ParsedPlace[] };

export class ImportError extends Error {
  constructor(public code: "too_large" | "unsupported" | "empty" | "invalid" | "zip_too_large") {
    super(code);
  }
}

export const LIMITS = {
  fileBytes: 25 * 1024 * 1024,
  zipTotalBytes: 100 * 1024 * 1024,
  zipEntries: 2000,
  places: 5000,
};

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const baseName = (path: string) => path.split("/").pop() ?? path;
const stripBom = (s: string) => s.replace(/^﻿/, "");
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

/** Takeout liste dosya adından liste türü: "Want to go.csv" → daha sonra git */
export function listTypeFromName(fileName: string): "favorite" | "want_to_go" {
  const n = fileName.toLowerCase();
  return /want to go|gitmek iste|ziyaret edilecek|wanttogo/.test(n) ? "want_to_go" : "favorite";
}

const listNameFrom = (fileName: string) => baseName(fileName).replace(/\.(csv|json|geojson|kml)$/i, "").slice(0, 200);

// ---------------------------------------------------------------------------- Giriş noktası
export function parseImportFile(fileName: string, data: Uint8Array): ParsedFile[] {
  if (data.byteLength > LIMITS.fileBytes) throw new ImportError("too_large");
  const e = ext(fileName);
  let files: ParsedFile[];
  if (e === "zip" || e === "kmz") files = parseZip(fileName, data);
  else files = [parseText(fileName, stripBom(strFromU8(data)))].filter((f): f is ParsedFile => f !== null);
  const total = files.reduce((n, f) => n + f.places.length, 0);
  if (total === 0) throw new ImportError("empty");
  if (total > LIMITS.places) throw new ImportError("too_large");
  return files;
}

function parseText(fileName: string, text: string): ParsedFile | null {
  const e = ext(fileName);
  if (e === "json" || e === "geojson") return parseGeoJson(fileName, text);
  if (e === "csv") return parseCsvFile(fileName, text);
  if (e === "kml") return parseKml(fileName, text);
  if (e === "gpx") return parseGpx(fileName, text);
  throw new ImportError("unsupported");
}

function parseZip(fileName: string, data: Uint8Array): ParsedFile[] {
  let total = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      // Yalnızca ilgili dosyaları aç; boyut ve sayı sınırı (zip bombası koruması)
      filter: (f) => {
        count += 1;
        if (count > LIMITS.zipEntries) throw new ImportError("zip_too_large");
        const relevant = /\.(csv|json|geojson|kml|gpx)$/i.test(f.name) && !f.name.includes("__MACOSX");
        if (relevant) {
          total += f.originalSize;
          if (total > LIMITS.zipTotalBytes) throw new ImportError("zip_too_large");
        }
        return relevant;
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError("invalid");
  }
  const out: ParsedFile[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    // Takeout'ta yer içeren JSON'lar yalnızca Saved Places / Labeled Places (yorumlar vb. atlanır)
    if (/\.json$/i.test(path) && !/saved places|kaydedilen yerler|labeled places|etiketli yerler/i.test(path)) continue;
    try {
      const f = parseText(path, stripBom(strFromU8(bytes)));
      if (f && f.places.length) out.push({ ...f, fileName: path });
    } catch {
      // Tanınmayan dosya: arşivdeki diğerlerini engellemesin
    }
  }
  return out;
}

// ---------------------------------------------------------------------------- GeoJSON (Takeout Saved Places.json)
type Json = Record<string, unknown>;
const pick = (o: unknown, ...keys: string[]): unknown => {
  if (!o || typeof o !== "object") return undefined;
  const entries = Object.entries(o as Json);
  for (const k of keys) {
    const hit = entries.find(([key]) => key.toLowerCase() === k.toLowerCase());
    if (hit && hit[1] !== undefined && hit[1] !== null && hit[1] !== "") return hit[1];
  }
  return undefined;
};

export function parseGeoJson(fileName: string, text: string): ParsedFile {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ImportError("invalid");
  }
  const features = Array.isArray(pick(doc, "features")) ? (pick(doc, "features") as unknown[]) : [];
  const isTakeout = /saved places|kaydedilen|labeled|etiketli/i.test(fileName) ||
    features.some((f) => pick(pick(f, "properties"), "google_maps_url", "Google Maps URL") !== undefined);
  const places: ParsedPlace[] = [];
  for (const f of features) {
    const props = pick(f, "properties") ?? {};
    const loc = pick(props, "location") ?? {};
    const url = clean(pick(props, "google_maps_url", "Google Maps URL", "url"), 1024);
    const geom = pick(f, "geometry");
    const coords = pick(geom, "coordinates");
    let lat: number | null = null;
    let lng: number | null = null;
    if (Array.isArray(coords) && coords.length >= 2 && Number.isFinite(Number(coords[0])) && Number.isFinite(Number(coords[1]))) {
      [lng, lat] = [Number(coords[0]), Number(coords[1])];
    }
    const geo = pick(loc, "Geo Coordinates");
    if ((lat === null || (lat === 0 && lng === 0)) && geo) {
      lat = Number(pick(geo, "Latitude"));
      lng = Number(pick(geo, "Longitude"));
    }
    if (lat === 0 && lng === 0) [lat, lng] = [null, null]; // Takeout bilinmeyen konumu [0,0] yazar
    if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      const fromUrl = coordsFromGoogleUrl(url);
      [lat, lng] = fromUrl ? [fromUrl.lat, fromUrl.lng] : [null, null];
    }
    const name = clean(pick(loc, "name", "Business Name") ?? pick(props, "Title", "name", "title"), 200) ??
      nameFromGoogleUrl(url) ?? clean(pick(loc, "address", "Address"), 200);
    if (!name) continue;
    places.push({
      name,
      lat,
      lng,
      address: clean(pick(loc, "address", "Address"), 500),
      notes: clean(pick(props, "Comment", "comment", "description", "Note"), 5000),
      sourceRef: url ?? (lat !== null ? `geo:${lat},${lng}` : null),
      listName: listNameFrom(fileName),
      listType: listTypeFromName(fileName),
    });
  }
  return { source: isTakeout ? "google_takeout" : "csv", fileName, places };
}

// ---------------------------------------------------------------------------- CSV
/** RFC 4180 CSV (tırnaklı alan, alan içinde satır sonu, çift tırnak kaçışı); ayraç , veya ; */
export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const header = (h: string) => h.toLowerCase().replace(/[^a-zçğıöşü]/g, "");
const findCol = (heads: string[], names: string[]) => heads.findIndex((h) => names.includes(header(h)));

export function parseCsvFile(fileName: string, text: string): ParsedFile {
  const rows = parseCsv(text);
  if (rows.length < 2) return { source: "csv", fileName, places: [] };
  const heads = rows[0];
  const iName = findCol(heads, ["title", "başlık", "baslik", "name", "ad", "adı", "isim", "yer", "yeradı"]);
  const iUrl = findCol(heads, ["url", "link", "bağlantı", "googlemapsurl"]);
  const iNote = findCol(heads, ["note", "not", "notes", "notlar", "description", "açıklama", "aciklama"]);
  const iComment = findCol(heads, ["comment", "yorum"]);
  const iLat = findCol(heads, ["lat", "latitude", "enlem", "y"]);
  const iLng = findCol(heads, ["lng", "lon", "long", "longitude", "boylam", "x"]);
  const iAddr = findCol(heads, ["address", "adres"]);
  if (iName === -1 && iUrl === -1) throw new ImportError("invalid");
  // Takeout liste CSV'si: Title + URL (koordinat sütunu yok)
  const isTakeout = iUrl !== -1 && iLat === -1;

  const num = (v: string | undefined) => {
    if (v === undefined || v.trim() === "") return null;
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const places: ParsedPlace[] = [];
  for (const r of rows.slice(1)) {
    const url = iUrl >= 0 ? clean(r[iUrl], 1024) : null;
    const name = (iName >= 0 ? clean(r[iName], 200) : null) ?? nameFromGoogleUrl(url);
    if (!name) continue;
    let lat = iLat >= 0 ? num(r[iLat]) : null;
    let lng = iLng >= 0 ? num(r[iLng]) : null;
    if (lat === null || lng === null) {
      const c = coordsFromGoogleUrl(url);
      [lat, lng] = c ? [c.lat, c.lng] : [null, null];
    }
    const notes = [iNote >= 0 ? r[iNote] : "", iComment >= 0 ? r[iComment] : ""].map((x) => x?.trim()).filter(Boolean).join(" — ");
    places.push({
      name,
      lat,
      lng,
      address: iAddr >= 0 ? clean(r[iAddr], 500) : null,
      notes: clean(notes, 5000),
      sourceRef: url,
      listName: listNameFrom(fileName),
      listType: listTypeFromName(fileName),
    });
  }
  return { source: isTakeout ? "google_takeout" : "csv", fileName, places };
}

// ---------------------------------------------------------------------------- XML (KML, GPX)
/** XML metni: CDATA ve temel/sayısal varlıklar çözülür. Dış varlık (XXE) asla işlenmez. */
function xmlText(s: string | undefined): string {
  if (!s) return "";
  const cdata = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const raw = cdata ? cdata[1] : s;
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "i"))?.[1];

export function parseKml(fileName: string, text: string): ParsedFile {
  const places: ParsedPlace[] = [];
  // Klasör adları liste adı olur (Google My Maps katmanları)
  const folderRe = /<(?:\w+:)?Folder\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Folder>/gi;
  const chunks: { listName: string | null; xml: string }[] = [];
  let m: RegExpExecArray | null;
  let rest = text;
  while ((m = folderRe.exec(text))) {
    chunks.push({ listName: clean(xmlText(tag(m[1].replace(/<(?:\w+:)?Placemark[\s\S]*$/i, ""), "name")), 200), xml: m[1] });
    rest = rest.replace(m[0], "");
  }
  chunks.push({ listName: clean(xmlText(tag(text.replace(/<(?:\w+:)?(Folder|Placemark)[\s\S]*$/i, ""), "name")), 200), xml: rest });

  for (const chunk of chunks) {
    const pmRe = /<(?:\w+:)?Placemark\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Placemark>/gi;
    while ((m = pmRe.exec(chunk.xml))) {
      const pm = m[1];
      const point = tag(pm, "Point");
      if (!point) continue; // çizgi/alan: yer değil (rota içe aktarma ayrı özellik)
      const coords = xmlText(tag(point, "coordinates")).trim().split(/\s+/)[0]?.split(",");
      const lng = Number(coords?.[0]);
      const lat = Number(coords?.[1]);
      const name = clean(stripHtml(xmlText(tag(pm, "name"))), 200);
      if (!name) continue;
      const ok = Number.isFinite(lat) && Number.isFinite(lng);
      places.push({
        name,
        lat: ok ? lat : null,
        lng: ok ? lng : null,
        address: clean(xmlText(tag(pm, "address")), 500),
        notes: clean(stripHtml(xmlText(tag(pm, "description"))), 5000),
        sourceRef: ok ? `kml:${lat.toFixed(6)},${lng.toFixed(6)}:${name}`.slice(0, 1024) : null,
        listName: chunk.listName ?? listNameFrom(fileName),
        listType: listTypeFromName(chunk.listName ?? fileName),
      });
    }
  }
  return { source: "kml", fileName, places };
}

export function parseGpx(fileName: string, text: string): ParsedFile {
  const places: ParsedPlace[] = [];
  const re = /<(?:\w+:)?wpt\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?wpt>|<(?:\w+:)?wpt\b([^>]*)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1] ?? m[3] ?? "";
    const body = m[2] ?? "";
    const lat = Number(attrs.match(/\blat\s*=\s*["']([^"']+)["']/)?.[1]);
    const lng = Number(attrs.match(/\blon\s*=\s*["']([^"']+)["']/)?.[1]);
    const name = clean(xmlText(tag(body, "name")), 200);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    places.push({
      name,
      lat,
      lng,
      notes: clean(stripHtml(xmlText(tag(body, "desc") ?? tag(body, "cmt"))), 5000),
      sourceRef: `gpx:${lat.toFixed(6)},${lng.toFixed(6)}:${name}`.slice(0, 1024),
      listName: listNameFrom(fileName),
      listType: "favorite",
    });
  }
  return { source: "gpx", fileName, places };
}
