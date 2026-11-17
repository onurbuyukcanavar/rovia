import { strFromU8, unzipSync } from "fflate";
import { haversine, type LatLng } from "@/lib/geo";

/**
 * GPX 1.0/1.1 ve KML 2.2 (KMZ dahil) iz ayrıştırıcısı. Tarayıcıda çalışır: dosya sunucuya yüklenmez.
 *
 * Güvenlik: XML ayrıştırıcı kullanılmaz (dış varlık / XXE riski yok); DOCTYPE veya ENTITY içeren
 * belgeler doğrudan reddedilir. Boyut, nokta ve KMZ arşiv sınırları uygulanır; koordinatlar doğrulanır.
 *
 * Desteklenenler: GPX trk/trkseg/trkpt (time, ele), rte/rtept, wpt · KML LineString, gx:Track,
 * gx:MultiTrack, MultiGeometry, Point (yer imleri).
 */
export type TrackSource = "gpx" | "kml";
export type TrackPoint = { lat: number; lng: number; ele?: number; t?: number };
export type TrackWaypoint = { name: string; lat: number; lng: number; description: string | null };

export type ParsedTrack = {
  source: TrackSource;
  name: string | null;
  /** Bölümler (trkseg / LineString); her biri en az 2 nokta */
  segments: TrackPoint[][];
  waypoints: TrackWaypoint[];
};

export type TrackStats = {
  distanceM: number;
  pointCount: number;
  /** Tüm noktalarda geçerli ve artan zaman damgası varsa */
  hasTime: boolean;
  startedAt: number | null;
  endedAt: number | null;
  elapsedS: number | null;
  movingS: number | null;
};

export const TRACK_LIMITS = {
  fileBytes: 15 * 1024 * 1024,
  kmzTotalBytes: 50 * 1024 * 1024,
  kmzEntries: 500,
  points: 200_000,
  waypoints: 2000,
};

export type TrackErrorCode = "too_large" | "too_many_points" | "unsupported" | "unsafe" | "invalid" | "empty";
export class TrackImportError extends Error {
  constructor(public code: TrackErrorCode) {
    super(code);
  }
}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const clean = (s: string | null | undefined, max: number) => (s ? s.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

/** CDATA ve temel/sayısal varlıklar; dış varlık asla çözülmez (DOCTYPE zaten reddedildi). */
function xmlText(s: string | undefined): string {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(parseInt(h, 16), 0x10ffff)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
const stripHtml = (s: string) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ");
const tagRe = (name: string, flags = "gi") => new RegExp(`<(?:[\\w-]+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${name}\\s*>)`, flags);
const first = (xml: string, name: string) => xml.match(tagRe(name, "i"))?.[2];
const all = (xml: string, name: string) => [...xml.matchAll(tagRe(name))].map((m) => ({ attrs: m[1] ?? "", body: m[2] ?? "" }));
const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`))?.[1];

const validLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90;
const validLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180;
function parseTime(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const v = Date.parse(xmlText(s).trim());
  return Number.isFinite(v) ? v : undefined;
}
function parseEle(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const v = Number(xmlText(s).trim());
  return Number.isFinite(v) && Math.abs(v) < 20000 ? v : undefined;
}

class Counter {
  n = 0;
  add(k: number) {
    this.n += k;
    if (this.n > TRACK_LIMITS.points) throw new TrackImportError("too_many_points");
  }
}

// ---------------------------------------------------------------------------- Giriş noktası
export function parseTrackFile(fileName: string, data: Uint8Array): ParsedTrack {
  if (data.byteLength > TRACK_LIMITS.fileBytes) throw new TrackImportError("too_large");
  const e = ext(fileName);
  if (e === "kmz") return parseTrackText("kml", kmzToKml(data));
  if (e !== "gpx" && e !== "kml") throw new TrackImportError("unsupported");
  return parseTrackText(e, strFromU8(data));
}

export function parseTrackText(kind: TrackSource, raw: string): ParsedTrack {
  const text = raw.replace(/^﻿/, "");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TrackImportError("unsafe");
  const root = kind === "gpx" ? /<(?:[\w-]+:)?gpx\b/i : /<(?:[\w-]+:)?kml\b/i;
  if (!root.test(text.slice(0, 4096))) throw new TrackImportError("invalid");
  const track = kind === "gpx" ? parseGpxTrack(text) : parseKmlTrack(text);
  if (!track.segments.length && !track.waypoints.length) throw new TrackImportError("empty");
  return track;
}

function kmzToKml(data: Uint8Array): string {
  let total = 0;
  let count = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        count += 1;
        if (count > TRACK_LIMITS.kmzEntries) throw new TrackImportError("too_large");
        const relevant = /\.kml$/i.test(f.name) && !f.name.includes("__MACOSX");
        if (relevant) {
          total += f.originalSize;
          if (total > TRACK_LIMITS.kmzTotalBytes) throw new TrackImportError("too_large");
        }
        return relevant;
      },
    });
  } catch (err) {
    if (err instanceof TrackImportError) throw err;
    throw new TrackImportError("invalid");
  }
  // KMZ kuralı: kökteki ilk .kml (genelde doc.kml)
  const names = Object.keys(entries).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  if (!names.length) throw new TrackImportError("empty");
  const bytes = entries[names[0]];
  if (bytes.byteLength > TRACK_LIMITS.fileBytes) throw new TrackImportError("too_large");
  return strFromU8(bytes);
}

// ---------------------------------------------------------------------------- GPX
function gpxPoint(attrs: string, body: string): TrackPoint | null {
  const lat = Number(attr(attrs, "lat"));
  const lng = Number(attr(attrs, "lon"));
  if (!validLat(lat) || !validLng(lng)) return null;
  const p: TrackPoint = { lat, lng };
  const ele = parseEle(first(body, "ele"));
  if (ele !== undefined) p.ele = ele;
  const t = parseTime(first(body, "time"));
  if (t !== undefined) p.t = t;
  return p;
}

function parseGpxTrack(text: string): ParsedTrack {
  const counter = new Counter();
  const segments: TrackPoint[][] = [];
  const pushSeg = (pts: TrackPoint[]) => {
    if (pts.length > 1) segments.push(pts);
  };
  const readPoints = (xml: string, name: string) => {
    const re = tagRe(name);
    const out: TrackPoint[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      counter.add(1);
      const p = gpxPoint(m[1] ?? "", m[2] ?? "");
      if (p) out.push(p);
    }
    return out;
  };
  const trks = all(text, "trk");
  for (const trk of trks) for (const seg of all(trk.body, "trkseg")) pushSeg(readPoints(seg.body, "trkpt"));
  // İz yoksa rota (rte) kullanılır
  if (!segments.length) for (const rte of all(text, "rte")) pushSeg(readPoints(rte.body, "rtept"));

  const waypoints: TrackWaypoint[] = [];
  // Yalnızca kök düzeyindeki wpt: trk/rte gövdeleri çıkarılır
  const outside = text.replace(tagRe("trk"), "").replace(tagRe("rte"), "");
  for (const w of all(outside, "wpt")) {
    if (waypoints.length >= TRACK_LIMITS.waypoints) break;
    const lat = Number(attr(w.attrs, "lat"));
    const lng = Number(attr(w.attrs, "lon"));
    if (!validLat(lat) || !validLng(lng)) continue;
    const name = clean(xmlText(first(w.body, "name")), 200);
    if (!name) continue;
    waypoints.push({ name, lat, lng, description: clean(xmlText(first(w.body, "desc") ?? first(w.body, "cmt")), 1000) });
  }
  const metadata = first(text, "metadata") ?? "";
  const name = clean(xmlText(first(metadata, "name") ?? (trks[0] ? first(trks[0].body, "name") : undefined)), 160);
  return { source: "gpx", name, segments, waypoints };
}

// ---------------------------------------------------------------------------- KML
function kmlCoords(s: string, counter: Counter): TrackPoint[] {
  const tuples = xmlText(s).trim().split(/\s+/).filter(Boolean);
  counter.add(tuples.length);
  const out: TrackPoint[] = [];
  for (const tuple of tuples) {
    const [x, y, z] = tuple.split(",").map(Number);
    if (!validLat(y) || !validLng(x)) continue;
    const p: TrackPoint = { lat: y, lng: x };
    if (Number.isFinite(z) && Math.abs(z) < 20000 && z !== 0) p.ele = z;
    out.push(p);
  }
  return out;
}

function gxTrack(body: string, counter: Counter): TrackPoint[] {
  const whens = all(body, "when").map((w) => parseTime(w.body));
  const coords = all(body, "coord");
  counter.add(coords.length);
  const out: TrackPoint[] = [];
  coords.forEach((c, i) => {
    const [x, y, z] = xmlText(c.body).trim().split(/\s+/).map(Number);
    if (!validLat(y) || !validLng(x)) return;
    const p: TrackPoint = { lat: y, lng: x };
    if (Number.isFinite(z) && Math.abs(z) < 20000) p.ele = z;
    const t = whens[i];
    if (t !== undefined) p.t = t;
    out.push(p);
  });
  return out;
}

function parseKmlTrack(text: string): ParsedTrack {
  const counter = new Counter();
  const segments: TrackPoint[][] = [];
  const waypoints: TrackWaypoint[] = [];
  for (const pm of all(text, "Placemark")) {
    const body = pm.body;
    const name = clean(xmlText(first(body, "name")), 200);
    let found = false;
    for (const tr of all(body, "Track")) {
      const pts = gxTrack(tr.body, counter);
      if (pts.length > 1) segments.push(pts);
      found = true;
    }
    // LineString (MultiGeometry içindekiler dahil); gx:Track zaten okunduysa tekrar sayılmaz
    if (!found) {
      for (const ls of all(body, "LineString")) {
        const pts = kmlCoords(first(ls.body, "coordinates") ?? "", counter);
        if (pts.length > 1) segments.push(pts);
        found = true;
      }
    }
    if (!found) {
      const point = first(body, "Point");
      if (point !== undefined && name && waypoints.length < TRACK_LIMITS.waypoints) {
        const [p] = kmlCoords(first(point, "coordinates") ?? "", counter);
        if (p) waypoints.push({ name, lat: p.lat, lng: p.lng, description: clean(stripHtml(xmlText(first(body, "description"))), 1000) });
      }
    }
  }
  const doc = first(text, "Document") ?? text;
  const name = clean(xmlText(first(doc.replace(/<(?:[\w-]+:)?(Folder|Placemark|Style|StyleMap)\b[\s\S]*$/i, ""), "name")), 160);
  return { source: "kml", name, segments, waypoints };
}

// ---------------------------------------------------------------------------- İstatistik
/** Hareket: ardışık iki nokta arasında hız ≥ 1 km/sa ve boşluk ≤ 10 dk */
const MOVING_MPS = 1 / 3.6;
const MAX_GAP_MS = 10 * 60_000;

export function trackStats(segments: TrackPoint[][]): TrackStats {
  let distanceM = 0;
  let pointCount = 0;
  let hasTime = segments.length > 0;
  let movingMs = 0;
  let prevT = -Infinity;
  for (const seg of segments) {
    pointCount += seg.length;
    for (let i = 0; i < seg.length; i++) {
      const p = seg[i];
      if (p.t === undefined || p.t < prevT) hasTime = false;
      else prevT = p.t;
      if (i === 0) continue;
      const d = haversine(seg[i - 1], p);
      distanceM += d;
      const a = seg[i - 1].t;
      if (a !== undefined && p.t !== undefined) {
        const dt = p.t - a;
        if (dt > 0 && dt <= MAX_GAP_MS && d / (dt / 1000) >= MOVING_MPS) movingMs += dt;
      }
    }
  }
  const firstT = segments[0]?.[0]?.t;
  const lastSeg = segments[segments.length - 1];
  const lastT = lastSeg?.[lastSeg.length - 1]?.t;
  if (hasTime && (firstT === undefined || lastT === undefined || lastT <= firstT)) hasTime = false;
  return {
    distanceM: Math.round(distanceM),
    pointCount,
    hasTime,
    startedAt: hasTime ? firstT! : null,
    endedAt: hasTime ? lastT! : null,
    elapsedS: hasTime ? Math.round((lastT! - firstT!) / 1000) : null,
    movingS: hasTime ? Math.round(movingMs / 1000) : null,
  };
}

export const toLatLngs = (segments: TrackPoint[][]): LatLng[][] => segments.map((s) => s.map((p) => ({ lat: p.lat, lng: p.lng })));
