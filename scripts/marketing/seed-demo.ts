/**
 * Demo hesabını (demo@roviaroad.com) gerçekçi örnek verilerle doldurur — İstanbul → Fethiye ekseni.
 * Tekrar çalıştırılabilir: önce hesabın TÜM önceki verisi silinir, sonra her şey baştan oluşturulur.
 *
 * Çalıştırma:  DEMO_PASSWORD=… NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… npx tsx scripts/marketing/seed-demo.ts
 *
 * Yalnızca publishable anahtar + demo kullanıcısının oturumu kullanılır (RLS altında; servis anahtarı yok).
 * Satırlar uygulamanın kendi yollarıyla üretilir:
 *  - Planlı yolculuk: save_trip_plan RPC'si — saveTripPlan (src/lib/actions/trips.ts) ile birebir aynı dönüşüm.
 *    Rota geometrisi canlı uygulamanın /api/maps/route uç noktasından (Valhalla) gelir; erişilemezse
 *    aynı Valhalla sunucusuna doğrudan sorulur.
 *  - Tamamlanan yolculuklar: GPS kaydedicinin bıraktığı satırlar (trips + trip_recordings + recording_segments +
 *    gps_points). Noktalar gerçek rota çizgisi boyunca 5 sn aralıkla, gerçekçi hız/doğruluk ile üretilir;
 *    özet (mesafe, süreler, hızlar, sadeleştirilmiş iz) sunucudaki ensureRecordingSummary ile AYNI
 *    fonksiyonlarla (summarizeTrack, encodeTrack) hesaplanır, uç nokta adları reverse_geocode RPC'sinden gelir.
 *  - Favoriler: save_places RPC (OSM eşleştirme ve kategori veritabanında).
 *  - Günlük notları: journal_note_save RPC. Seyahatname: travelogue_create / _save / _section_save / _entry_create / _entry_save.
 */
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { decodePolyline, encodePolyline, haversine, simplifyToMaxPoints, type LatLng } from "@/lib/geo";
import { summarizeTrack, type SegmentInput } from "@/lib/gps/filter";
import { encodeTrack } from "@/lib/gps/track";
import { drive, dwell, splitLegs, type Pt } from "./gps-sim";
import { docToText, sanitizeDoc, type Doc } from "@/lib/travelogue/doc";
import {
  BASE_URL, DEMO_EMAIL, DEMO_NAME, DEMO_USERNAME, SEED_FILE, demoPassword, log, newClient, retry, signIn,
  supabaseConfig, writeJson, type Db, type SeedResult,
} from "./common";

/** Yaklaşık benzin fiyatı (TL/L) — maliyet kartında örnek değer; gerekirse güncelleyin. */
const FUEL_PRICE_TL = 52.9;
const TZ = "+03:00";

// ----------------------------------------------------------------------------- Yerler
type Place = { key: string; name: string; query: string; lat: number; lng: number; address?: string; ref?: string | null };

const PLACES: Record<string, Place> = {
  kadikoy: { key: "kadikoy", name: "Kadıköy", query: "Kadıköy", lat: 40.9906, lng: 29.0254, address: "Kadıköy, İstanbul" },
  bursa: { key: "bursa", name: "Bursa Ulu Cami", query: "Ulu Cami", lat: 40.1841, lng: 29.0618, address: "Osmangazi, Bursa" },
  iskender: { key: "iskender", name: "Kebapçı İskender", query: "Kebapçı İskender", lat: 40.1834, lng: 29.0655, address: "Osmangazi, Bursa" },
  afyon: { key: "afyon", name: "Afyonkarahisar Kalesi", query: "Afyonkarahisar Kalesi", lat: 38.7622, lng: 30.5371, address: "Merkez, Afyonkarahisar" },
  pamukkale: { key: "pamukkale", name: "Pamukkale Travertenleri", query: "Pamukkale Travertenleri", lat: 37.9206, lng: 29.121, address: "Pamukkale, Denizli" },
  hierapolis: { key: "hierapolis", name: "Hierapolis Antik Kenti", query: "Hierapolis", lat: 37.9258, lng: 29.1258, address: "Pamukkale, Denizli" },
  oludeniz: { key: "oludeniz", name: "Ölüdeniz Plajı", query: "Ölüdeniz", lat: 36.5497, lng: 29.1153, address: "Fethiye, Muğla" },
  kelebekler: { key: "kelebekler", name: "Kelebekler Vadisi", query: "Kelebekler Vadisi", lat: 36.5236, lng: 29.1028, address: "Fethiye, Muğla" },
  saklikent: { key: "saklikent", name: "Saklıkent Kanyonu", query: "Saklıkent Kanyonu", lat: 36.4709, lng: 29.4023, address: "Seydikemer, Muğla" },
  kayakoy: { key: "kayakoy", name: "Kayaköy", query: "Kayaköy", lat: 36.5752, lng: 29.0869, address: "Fethiye, Muğla" },
  babadag: { key: "babadag", name: "Babadağ", query: "Babadağ Teleferik", lat: 36.5297, lng: 29.1728, address: "Fethiye, Muğla" },
  balikpazari: { key: "balikpazari", name: "Fethiye Balık Pazarı", query: "Balık Pazarı Fethiye", lat: 36.6219, lng: 29.1105, address: "Fethiye, Muğla" },
};

/** Yerin koordinatını ROVIA'nın OSM verisiyle (search_places) inceltir; 3 km'den uzak eşleşme kabul edilmez. */
async function refinePlaces(db: Db) {
  for (const p of Object.values(PLACES)) {
    try {
      const { data, error } = await db.rpc("search_places", { p_query: p.query, p_lat: p.lat, p_lng: p.lng, p_limit: 8 });
      if (error) throw new Error(error.message);
      const hit = (data ?? []).find((r) => r.lat !== null && r.lng !== null && haversine({ lat: r.lat, lng: r.lng }, p) < 3_000);
      if (hit && hit.lat !== null && hit.lng !== null) {
        p.lat = hit.lat;
        p.lng = hit.lng;
        p.ref = hit.osm_ref && /^[nwr][0-9]{1,19}$/.test(hit.osm_ref) ? hit.osm_ref : null;
        if (hit.admin) p.address = hit.admin;
        log(`  yer ${p.name} → ${hit.name} (${hit.osm_ref ?? "—"})`);
      } else {
        log(`  yer ${p.name}: OSM eşleşmesi yok, sabit koordinat`);
      }
    } catch (e) {
      log(`  yer ${p.name}: arama başarısız (${e instanceof Error ? e.message : e}), sabit koordinat`);
    }
  }
}

// ----------------------------------------------------------------------------- Rota
type Route = {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  legs: { distanceMeters: number; durationSeconds: number }[];
  hasToll: boolean;
  hasFerry: boolean;
};

/** Uygulamanın oturum çerezleri (@supabase/ssr'nin kendi biçimiyle) — /api/maps/route için. */
async function appCookies(): Promise<string> {
  const { url, key } = supabaseConfig();
  const jar = new Map<string, string>();
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const c of list) {
          if (c.value) jar.set(c.name, c.value);
          else jar.delete(c.name);
        }
      },
    },
  });
  const { error } = await sb.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword() });
  if (error) throw new Error(`ssr sign-in: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

let cookieHeader: string | null = null;

async function routeViaApp(points: LatLng[]): Promise<Route> {
  cookieHeader ??= await appCookies();
  const res = await fetch(`${BASE_URL}/api/maps/route`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({
      origin: points[0], destination: points[points.length - 1], intermediates: points.slice(1, -1), alternatives: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`/api/maps/route ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { routes?: Route[] };
  const r = body.routes?.[0];
  if (!r?.encodedPolyline) throw new Error("rota yanıtı boş");
  return r;
}

/** Yedek: uygulamanın kullandığı herkese açık Valhalla sunucusu (precision 6 → 5). */
async function routeViaValhalla(points: LatLng[]): Promise<Route> {
  const res = await fetch("https://valhalla1.openstreetmap.de/route", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "rovia-marketing-seed" },
    body: JSON.stringify({
      locations: points.map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
      costing: "auto", costing_options: { auto: { use_ferry: 1 } }, units: "kilometers", directions_type: "none",
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`valhalla ${res.status}`);
  type V = { trip: { legs: { shape: string; summary: { length: number; time: number } }[]; summary: { length: number; time: number; has_toll?: boolean; has_ferry?: boolean } } };
  const v = (await res.json()) as V;
  const path = v.trip.legs.flatMap((l, i) => decodePolyline(l.shape, 6).slice(i === 0 ? 0 : 1));
  return {
    encodedPolyline: encodePolyline(path),
    distanceMeters: Math.round(v.trip.summary.length * 1000),
    durationSeconds: Math.round(v.trip.summary.time),
    legs: v.trip.legs.map((l) => ({ distanceMeters: Math.round(l.summary.length * 1000), durationSeconds: Math.round(l.summary.time) })),
    hasToll: Boolean(v.trip.summary.has_toll),
    hasFerry: Boolean(v.trip.summary.has_ferry),
  };
}

async function getRoute(label: string, points: LatLng[]): Promise<Route> {
  try {
    const r = await retry(`rota ${label} (uygulama)`, () => routeViaApp(points), 3, 4_000);
    log(`  rota ${label}: ${(r.distanceMeters / 1000).toFixed(0)} km (uygulama API'si)`);
    return r;
  } catch {
    const r = await retry(`rota ${label} (Valhalla)`, () => routeViaValhalla(points), 3, 4_000);
    log(`  rota ${label}: ${(r.distanceMeters / 1000).toFixed(0)} km (doğrudan Valhalla)`);
    return r;
  }
}

// ----------------------------------------------------------------------------- Tarihler
const pad = (n: number) => String(n).padStart(2, "0");
/** İstanbul'daki bugünün tarihi (YYYY-MM-DD). */
const todayIst = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** dir=-1: verilen tarihten önceki (veya aynı) cumartesi; dir=1: sonraki (veya aynı). */
function saturday(date: string, dir: 1 | -1) {
  let d = date;
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = addDays(d, dir);
  return d;
}
const at = (date: string, hh: number, mm: number) => Date.parse(`${date}T${pad(hh)}:${pad(mm)}:00${TZ}`);
const iso = (ms: number) => new Date(ms).toISOString();
/** Türkiye saatiyle ISO (journal notları için offset'li biçim). */
const isoIst = (ms: number) => new Date(ms + 3 * 3600_000).toISOString().replace("Z", TZ).replace(/\.\d{3}/, "");

// ----------------------------------------------------------------------------- Metin
/** Paragraflardan TipTap belgesi. "## " ile başlayan satır başlık olur. */
function doc(...paras: string[]): Doc {
  const d = {
    type: "doc",
    content: paras.map((p) =>
      p.startsWith("## ")
        ? { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: p.slice(3) }] }
        : p.startsWith("> ")
          ? { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: p.slice(2) }] }] }
          : { type: "paragraph", content: [{ type: "text", text: p }] },
    ),
  };
  const clean = sanitizeDoc(d);
  if (!clean) throw new Error("doc sanitize failed");
  return clean;
}

// ----------------------------------------------------------------------------- Adımlar
async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.code ?? ""} ${error.message}`);
  return data;
}

/** must + satır zorunlu (insert … select().single(), RPC dönüşü). */
async function one<T>(label: string, p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<NonNullable<T>> {
  const data = await must(label, p);
  if (data === null || data === undefined) throw new Error(`${label}: boş yanıt`);
  return data as NonNullable<T>;
}

async function wipe(db: Db, uid: string) {
  log("Önceki demo verisi siliniyor…");
  // Sıra: yabancı anahtarlar (seyahatname → yolculuk, yolculuk → araç, not → yer)
  for (const table of ["shares", "travelogues", "journal_notes", "trips", "saved_places", "import_batches", "vehicles"] as const) {
    await must(`delete ${table}`, db.from(table).delete().eq("user_id", uid));
  }
  // Fotoğraf yok: medya tablosunda kayıt kalmışsa (elle eklenmiş) dokunulmaz; depolama dosyaları silinmez.
}

async function profileAndSettings(db: Db, uid: string) {
  log("Profil ve ayarlar…");
  const prof = await db.from("profiles").update({ full_name: DEMO_NAME, username: DEMO_USERNAME }).eq("id", uid);
  if (prof.error) {
    log(`  ! kullanıcı adı kaydedilemedi (${prof.error.message}); yalnızca ad yazılıyor`);
    await must("profile", db.from("profiles").update({ full_name: DEMO_NAME }).eq("id", uid));
  }
  await must("settings", db.from("user_settings").update({
    theme: "dark",
    cost_defaults: { fuelPrices: { gasoline: { price: FUEL_PRICE_TL, date: todayIst() } } },
  }).eq("user_id", uid));
}

async function vehicle(db: Db, uid: string) {
  log("Garaj…");
  const v = await one("vehicle", db.from("vehicles").insert({
    user_id: uid, name: "Renault Clio", make: "Renault", model: "Clio 1.0 TCe", model_year: 2022,
    fuel_type: "gasoline", consumption_per_100km: 5.6, tank_capacity: 42,
  }).select("id").single());
  await must("vehicle default", db.rpc("vehicle_set_default", { p_id: v.id }));
  return v.id;
}

async function favorites(db: Db) {
  log("Favoriler…");
  const P = PLACES;
  const item = (p: Place, category: string, list: "favorite" | "want_to_go", notes: string) => ({
    name: p.name, lat: p.lat, lng: p.lng, address: p.address ?? null, notes, category, list_type: list,
    osm_ref: p.ref ?? null, source_ref: null, list_name: null,
  });
  const explore = [
    item(P.pamukkale, "nature", "favorite", "Travertenlerde çıplak ayakla yürünüyor. Gün batımına doğru kalabalık azalıyor, su da ılık oluyor."),
    item(P.hierapolis, "historic", "favorite", "Tiyatroya kadar yokuşu çık, manzara ödül gibi. Antik havuz ayrı bilet."),
    item(P.saklikent, "nature", "favorite", "Su buz gibi; kaymaz terlik şart. Girişteki alabalıkçılar dönüşte iyi gelir."),
    item(P.kayakoy, "historic", "favorite", "Terk edilmiş Rum köyü. Gün batımında taş evler turuncuya dönüyor."),
    item(P.kelebekler, "nature", "want_to_go", "Ölüdeniz'den tekneyle yaklaşık 20 dakika. Kelebek mevsimi haziran–eylül."),
    item(P.babadag, "nature", "want_to_go", "Teleferikle 1700 metreye çıkılıyor. Yamaç paraşütü için sabah rüzgârına bak."),
  ];
  const manual = [
    item(P.oludeniz, "nature", "favorite", "Sabah erken git. Öğleden sonra paraşütçüler kumsala iniyor, izlemesi ayrı keyif."),
    item(P.bursa, "historic", "favorite", "İçerideki şadırvan ve duvarlardaki hat yazıları. Cuma öğlesi kalabalık oluyor."),
    item(P.iskender, "restaurant", "favorite", "Tarihi dükkân. Tereyağını masada döküyorlar; yanına şıra iste."),
    item(P.balikpazari, "restaurant", "favorite", "Balığı tezgâhtan seçiyorsun, çevredeki lokantalar pişiriyor. Akşamüstü canlı."),
  ];
  await must("save_places explore", db.rpc("save_places", { p_source: "explore", p_file_name: null, p_items: explore } as never));
  await must("save_places manual", db.rpc("save_places", { p_source: "manual", p_file_name: null, p_items: manual } as never));
  const rows = await must("saved_places", db.from("saved_places").select("id, name"));
  return new Map((rows ?? []).map((r) => [r.name, r.id]));
}

const stopJson = (p: Place) => ({ name: p.name, address: p.address ?? null, lat: p.lat, lng: p.lng, ref: p.ref ?? null });

async function plannedTrip(db: Db, date: string) {
  log(`Planlı yolculuk (${date})…`);
  const stops = [PLACES.kadikoy, PLACES.bursa, PLACES.afyon, PLACES.pamukkale, PLACES.oludeniz];
  const route = await getRoute("planlı", stops);
  // saveTripPlan ile aynı dönüşüm (src/lib/actions/trips.ts)
  const dbRoute = {
    polyline: encodePolyline(simplifyToMaxPoints(decodePolyline(route.encodedPolyline), 8_000, 3)),
    distance_m: route.distanceMeters,
    duration_s: route.durationSeconds,
    legs: route.legs.map((l) => ({ d: l.distanceMeters, s: l.durationSeconds })),
    has_toll: route.hasToll,
    has_ferry: route.hasFerry,
  };
  const rows = await must("save_trip_plan", db.rpc("save_trip_plan", {
    p_trip_id: null, p_expected_version: null,
    p_title: "İstanbul – Fethiye yol yolculuğu",
    p_description: "Aralıkta ikinci tur: bu sefer Afyon'da kaymaklı kahvaltı, Pamukkale'de bir gece konaklama. Dönüşte acele yok.",
    p_planned_date: date,
    p_stops: stops.map(stopJson),
    p_route: dbRoute,
    p_route_options: { avoid_tolls: false, avoid_highways: false, avoid_ferries: false },
  } as never)) as unknown as { trip_id: string }[] | { trip_id: string };
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row.trip_id;
}

type SegmentPlan = { startMs: number; pts: Pt[]; endMs: number; reason: "pause" | "complete" };

async function label(db: Db, p: LatLng | null) {
  if (!p) return null;
  const r = await db.rpc("reverse_geocode", { p_lat: p.lat, p_lng: p.lng });
  return r.data?.[0]?.label?.slice(0, 200) ?? null;
}

/** GPS kaydedicinin bırakacağı satırları yazar ve özeti sunucudakiyle aynı fonksiyonlarla hesaplar. */
async function recordedTrip(db: Db, uid: string, title: string, description: string, segments: SegmentPlan[]) {
  const startedAt = segments[0].startMs;
  const endedAt = segments[segments.length - 1].endMs;
  if (endedAt > Date.now()) throw new Error("kayıt geleceğe taşıyor");
  const trip = await one("trip", db.from("trips").insert({
    user_id: uid, title, description, status: "completed", started_at: iso(startedAt), completed_at: iso(endedAt),
  }).select("id").single());
  const recId = randomUUID();
  await must("recording", db.from("trip_recordings").insert({
    id: recId, client_id: recId, trip_id: trip.id, user_id: uid, status: "completed", source: "gps",
    started_at: iso(startedAt), ended_at: iso(endedAt),
  }));
  const inputs: SegmentInput[] = [];
  let total = 0;
  for (const seg of segments) {
    const segId = randomUUID();
    const segSummary = summarizeTrack([{ startedAt: seg.startMs, endedAt: seg.endMs, points: seg.pts }], seg.startMs, seg.endMs);
    await must("segment", db.from("recording_segments").insert({
      id: segId, recording_id: recId, user_id: uid, started_at: iso(seg.startMs), ended_at: iso(seg.endMs),
      end_reason: seg.reason, distance_m: segSummary.distanceM,
    }));
    const rows = seg.pts.map((p) => ({
      recording_id: recId, segment_id: segId, user_id: uid, recorded_at: iso(p.t), latitude: p.lat, longitude: p.lng,
      accuracy_m: p.acc, speed_mps: Math.round(p.spd * 100) / 100, heading_deg: p.hdg, altitude_m: null,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      await retry("gps_points", async () => {
        const { error } = await db.from("gps_points").upsert(rows.slice(i, i + 1000), { onConflict: "recording_id,recorded_at", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      });
    }
    total += rows.length;
    inputs.push({ startedAt: seg.startMs, endedAt: seg.endMs, points: seg.pts });
  }
  // ensureRecordingSummary (src/lib/recordings/server.ts) ile aynı hesap
  const summary = summarizeTrack(inputs, startedAt, endedAt);
  const [startLabel, endLabel] = await Promise.all([label(db, summary.start), label(db, summary.end)]);
  await must("summary", db.from("trip_recordings").update({
    total_distance_m: summary.distanceM,
    moving_duration_s: summary.movingS,
    paused_duration_s: summary.pausedS,
    elapsed_duration_s: summary.elapsedS,
    average_speed_kmh: summary.averageKmh,
    max_speed_kmh: summary.maxKmh,
    start_latitude: summary.start?.lat ?? null,
    start_longitude: summary.start?.lng ?? null,
    end_latitude: summary.end?.lat ?? null,
    end_longitude: summary.end?.lng ?? null,
    start_label: startLabel,
    end_label: endLabel,
    point_count: summary.pointCount,
    simplified_polyline: encodeTrack(summary.paths),
  }).eq("id", recId));
  log(`  "${title}": ${total} nokta, ${(summary.distanceM / 1000).toFixed(0)} km, ort. ${summary.averageKmh} km/sa, azami ${summary.maxKmh} km/sa (${startLabel ?? "?"} → ${endLabel ?? "?"})`);
  return trip.id;
}

type Moments = { kadikoyStart: number; bursaArr: number; bursaDep: number; rest: { at: LatLng; ms: number } | null; pamukkaleArr: number; day2Start: number; oludenizArr: number };

async function mainTrip(db: Db, uid: string, d1: string) {
  log(`Tamamlanan yolculuk (${d1})…`);
  const stops = [PLACES.kadikoy, PLACES.bursa, PLACES.pamukkale, PLACES.oludeniz];
  const route = await getRoute("tamamlanan", stops);
  const legs = splitLegs(decodePolyline(route.encodedPolyline), stops);
  const d2 = addDays(d1, 1);

  const s1: Pt[] = [];
  const start1 = at(d1, 7, 10);
  const a1 = drive(s1, legs[0], route.legs[0].durationSeconds, start1);
  const bursaDep = dwell(s1, PLACES.bursa, a1.arrivalMs, 105);
  const a2 = drive(s1, legs[1], route.legs[1].durationSeconds, bursaDep, [{ at: 0.52, minutes: 35 }]);
  const end1 = dwell(s1, PLACES.pamukkale, a2.arrivalMs, 8);

  const s2: Pt[] = [];
  const start2 = at(d2, 10, 40);
  const a3 = drive(s2, legs[2], route.legs[2].durationSeconds, start2);
  const end2 = dwell(s2, PLACES.oludeniz, a3.arrivalMs, 6);

  const id = await recordedTrip(db, uid, "Fethiye hafta sonu",
    "İstanbul'dan Ölüdeniz'e iki gün: Bursa'da kahvaltı ve Ulu Cami, Pamukkale'de gün batımı, pazar öğleden sonra deniz.",
    [{ startMs: start1, pts: s1, endMs: end1, reason: "pause" }, { startMs: start2, pts: s2, endMs: end2, reason: "complete" }]);
  const r = a2.restPoints[0];
  const moments: Moments = {
    kadikoyStart: start1, bursaArr: a1.arrivalMs, bursaDep, rest: r ? { at: r.at, ms: r.startMs } : null,
    pamukkaleArr: a2.arrivalMs, day2Start: start2, oludenizArr: a3.arrivalMs,
  };
  return { id, moments };
}

async function secondTrip(db: Db, uid: string, d3: string) {
  log(`İkinci tamamlanan yolculuk (${d3})…`);
  const stops = [PLACES.oludeniz, PLACES.saklikent, PLACES.kayakoy, PLACES.oludeniz];
  const route = await getRoute("saklıkent", stops);
  const legs = splitLegs(decodePolyline(route.encodedPolyline), stops);
  const pts: Pt[] = [];
  const start = at(d3, 9, 30);
  const a1 = drive(pts, legs[0], route.legs[0].durationSeconds, start);
  const dep1 = dwell(pts, PLACES.saklikent, a1.arrivalMs, 125);
  const a2 = drive(pts, legs[1], route.legs[1].durationSeconds, dep1);
  const dep2 = dwell(pts, PLACES.kayakoy, a2.arrivalMs, 80);
  const a3 = drive(pts, legs[2], route.legs[2].durationSeconds, dep2);
  const end = dwell(pts, PLACES.oludeniz, a3.arrivalMs, 4);
  const id = await recordedTrip(db, uid, "Saklıkent ve Kayaköy",
    "Sabah kanyonda serin suda yürüyüş, akşamüstü terk edilmiş köyün taş evleri arasında gün batımı.",
    [{ startMs: start, pts, endMs: end, reason: "complete" }]);
  return { id, saklikentArr: a1.arrivalMs, kayakoyArr: a2.arrivalMs };
}

async function journal(db: Db, mainId: string, m: Moments, second: { id: string; saklikentArr: number; kayakoyArr: number }, places: Map<string, string>) {
  log("Seyahat günlüğü notları…");
  const restLabel = m.rest ? (await label(db, m.rest.at)) ?? "Yol üstü dinlenme tesisi" : "Yol üstü dinlenme tesisi";
  type N = { trip: string; kind: "note" | "memory" | "visit"; title: string; body: string; at: number; place: Place | null; loc?: string; ll?: LatLng | null };
  const P = PLACES;
  const notes: N[] = [
    { trip: mainId, kind: "note", title: "Yola çıkış", at: m.kadikoyStart - 6 * 60_000, place: P.kadikoy, loc: "Kadıköy",
      body: "İskele tarafında simit ve çayla başladık. Şehir daha uyanmamıştı; köprüye vardığımızda gün yeni ağarıyordu." },
    { trip: mainId, kind: "visit", title: "Ulu Cami'de yarım saat", at: m.bursaArr + 50 * 60_000, place: P.bursa,
      body: "İçeri girince ilk dikkat çeken ortadaki şadırvanın sesi. Yirmi kubbenin altında kimse acele etmiyor; duvarlardaki hat yazılarına bakarken zamanı unuttuk. Kahvaltıyı İskender'le kapattık, pişman değiliz." },
    ...(m.rest ? [{ trip: mainId, kind: "note" as const, title: "Mola", at: m.rest.ms + 10 * 60_000, place: null, loc: restLabel, ll: m.rest.at,
      body: "Benzinlikte gözleme ve ayran. Depoyu doldurduk; Clio yüz kilometrede altı litreyi bulmuyor, fena değil. Yolun bu kısmı uzun düzlüklerle geçiyor, müzik listesi bitti, baştan aldık." }] : []),
    { trip: mainId, kind: "memory", title: "Travertenlerde gün batımı", at: m.pamukkaleArr + 70 * 60_000, place: P.pamukkale,
      body: "Ayakkabıları elimize alıp beyaz basamaklardan indik. Su beklediğimizden ılıktı. Güneş Denizli ovasının üstünde kızarırken kimse fotoğraf çekmeyi bırakmıyordu, biz de dahil." },
    { trip: mainId, kind: "memory", title: "Sonunda deniz", at: m.oludenizArr + 25 * 60_000, place: P.oludeniz,
      body: "Son virajı dönünce lagün bir anda altımızda belirdi. Babadağ'dan inen paraşütler kumsala süzülüyordu. Arabayı park edip doğruca suya girdik; ekimin sonunda bile deniz sıcaktı." },
    { trip: second.id, kind: "visit", title: "Saklıkent'te buz gibi su", at: second.saklikentArr + 40 * 60_000, place: P.saklikent,
      body: "Kanyonun girişinde suyun soğuğu nefesimizi kesti. İçeri yürüdükçe duvarlar yükseliyor, gökyüzü ince bir şeride dönüşüyor. Çıkışta alabalık yedik." },
    { trip: second.id, kind: "memory", title: "Kayaköy akşamı", at: second.kayakoyArr + 45 * 60_000, place: P.kayakoy,
      body: "Yamaçtaki yüzlerce taş evin çatısı yok ama hepsinin bir penceresi batıya bakıyor. Şapele çıkan patikada yalnızca keçiler ve biz vardı." },
  ];
  for (const n of notes) {
    const ll = n.ll ?? (n.place ? { lat: n.place.lat, lng: n.place.lng } : null);
    await must(`note ${n.title}`, db.rpc("journal_note_save", {
      p_id: null, p_trip_id: n.trip, p_kind: n.kind, p_title: n.title, p_body: n.body, p_noted_at: isoIst(n.at),
      p_location_name: n.loc ?? n.place?.name ?? null, p_lat: ll?.lat ?? null, p_lng: ll?.lng ?? null,
      p_saved_place_id: n.place ? places.get(n.place.name) ?? null : null, p_media_ids: [],
    } as never));
  }
  log(`  ${notes.length} not`);
}

async function travelogue(db: Db, tripId: string, m: Moments, places: Map<string, string>) {
  log("Seyahatname…");
  const id = (await must("travelogue_create", db.rpc("travelogue_create", { p_trip_id: tripId, p_title: "Fethiye'ye Giden Yol", p_import_notes: false } as never))) as unknown as string;
  await must("travelogue_save", db.rpc("travelogue_save", {
    p_id: id, p_version: 1, p_force: true,
    p_patch: {
      title: "Fethiye'ye Giden Yol",
      subtitle: "İstanbul'dan Ölüdeniz'e, iki günde dört durak",
      purpose: "Uçağa binmeden, yolun kendisini görmek için çıktık.",
      summary: "Bursa'da bir kahvaltı, Pamukkale'de bir gün batımı ve sonunda Ölüdeniz. Ekim sonunda, kalabalık dağılmışken yapılmış bir sonbahar yolculuğunun notları.",
      ordering: "chronological",
      status: "published",
    },
  } as never));

  const sections = await must("sections", db.from("travelogue_sections").select("id, kind").eq("travelogue_id", id));
  const content: Partial<Record<string, Doc>> = {
    introduction: doc(
      "Fethiye'ye gitmenin kısa yolu bir saatlik uçuş. Biz uzun yolu seçtik: arabaya iki çanta, bir termos çay ve yarım bırakılmış bir müzik listesi koyup cumartesi sabahı Kadıköy'den çıktık.",
      "Plan basitti. Bursa'da kahvaltı, akşam Pamukkale, pazar günü deniz. Aradaki her şey yolun kendisine kalacaktı.",
    ),
    evaluation: doc(
      "İki günde dokuz yüz kilometreye yakın yol yaptık ama hiçbir bölümü yorucu gelmedi. Duraklar iyi seçilmişti; her biri bir öncekinden bambaşka bir manzara açtı.",
      "Bir dahaki sefere Pamukkale'de bir gece daha kalırdık. Hierapolis'i acele gezdik ve antik havuzu sabah erken saatte görmek istiyoruz.",
    ),
    epilogue: doc(
      "Dönüşte haritaya bakınca çizdiğimiz çizgi bir yolculuktan çok bir hikâyeye benziyordu. Belki de seyahatname yazmanın sebebi budur: yolu bir kez daha, bu sefer yavaşça gitmek.",
    ),
  };
  for (const s of sections ?? []) {
    const c = content[s.kind];
    if (!c) continue;
    await must(`section ${s.kind}`, db.rpc("travelogue_section_save", { p_id: s.id, p_version: 1, p_force: true, p_patch: { content: c } } as never));
  }

  const P = PLACES;
  type E = { type: "place" | "chronicle"; title: string; place: Place | null; visited: number; tags: string[]; intro?: Doc; narrative: Doc; history?: Doc; review?: Doc };
  const entries: E[] = [
    {
      type: "chronicle", title: "Kadıköy'den çıkarken", place: P.kadikoy, visited: m.kadikoyStart, tags: ["manzara"],
      narrative: doc(
        "Cumartesi sabahı yediyi on geçe yola çıktık. Moda'dan inen sokaklar boştu, yalnızca fırınların ışıkları yanıyordu.",
        "Körfez köprüsünü geçerken güneş Marmara'nın üstünde yükseldi. Arka koltukta termos, ön camda yol haritası; ilk saat neredeyse hiç konuşmadık. Yolun başında insan biraz sessiz oluyor.",
      ),
    },
    {
      type: "place", title: "Bursa: Ulu Cami ve bir tabak İskender", place: P.bursa, visited: m.bursaArr + 20 * 60_000, tags: ["tarih", "mimari", "gastronomi"],
      intro: doc("Osmanlı'nın ilk başkentinde kısa bir mola için durduk; bir buçuk saat sürdü."),
      narrative: doc(
        "Ulu Cami'ye girince dışarıdaki kalabalık bir anda yok oluyor. Ortadaki şadırvanın şırıltısı bütün yapıyı dolduruyor.",
        "Duvarlardaki hat yazılarının önünde uzun uzun durduk. Kimi bir avuç kadar küçük, kimi bir duvarı kaplıyor. Bir yaşlı amca hangisinin hangi hattata ait olduğunu anlattı, biz de dinledik.",
        "Çıkışta yüz metre ötedeki tarihi dükkânda İskender yedik. Tereyağı masada, cızırdayarak döküldü.",
      ),
      history: doc("Cami 14. yüzyılın sonunda, Yıldırım Bayezid döneminde yapıldı. Yirmi kubbeli planıyla erken Osmanlı mimarisinin en tanınmış örneklerinden biri."),
      review: doc("Sabah dokuz gibi gelmek en iyisi: cami sakin, dükkânlarda sıra yok."),
    },
    {
      type: "place", title: "Pamukkale'de beyazın içinde", place: P.pamukkale, visited: m.pamukkaleArr + 40 * 60_000, tags: ["doğa", "manzara", "antik kent"],
      narrative: doc(
        "Akşamüstü vardığımızda tepedeki otoparkta yer zor bulduk ama travertenlere indikten sonra kalabalık dağıldı.",
        "Ayakkabılar çıkıyor, sonra yalınayak beyaz basamaklardan aşağı iniliyor. Taş sanıldığı kadar kaygan değil; su ılık, havuzlar bulutları yansıtıyor.",
        "Güneş ovanın üstünde alçalınca her şey pembeye döndü. Hierapolis'in tiyatrosuna yetişemedik, ertesi sabaha bıraktık.",
      ),
      review: doc("Gün batımından bir buçuk saat önce gelin. Yanınıza ince bir havlu alın; dönüş yokuşu ıslak ayakla uzun sürüyor."),
    },
    {
      type: "place", title: "Ölüdeniz'e iniş", place: P.oludeniz, visited: m.oludenizArr, tags: ["sahil", "doğa", "manzara"],
      narrative: doc(
        "Fethiye'den sonra yol dağın yamacına tırmanıp bir anda aşağı dönüyor. Son virajda lagün ayaklarımızın altında belirdi; arabayı kenara çekip bir süre sadece baktık.",
        "Babadağ'dan atlayan paraşütçüler renkli noktalar gibi kumsala süzülüyordu. Ekim sonuydu ama deniz hâlâ sıcaktı.",
        "Yolculuğun sonunda yorgun değildik. Sanki dokuz yüz kilometre bu manzaraya varmak için gereken mesafeydi, ne eksik ne fazla.",
      ),
    },
  ];
  const ids: string[] = [];
  for (const e of entries) {
    const fields: Record<string, unknown> = {
      entry_type: e.type, title: e.title, location_name: e.place?.name ?? null, address: e.place?.address ?? null,
      osm_ref: e.place?.ref ?? null, saved_place_id: e.place ? places.get(e.place.name) ?? null : null,
      visited_at: isoIst(e.visited), tags: e.tags,
    };
    if (e.place) { fields.lat = e.place.lat; fields.lng = e.place.lng; }
    const entryId = (await must(`entry ${e.title}`, db.rpc("travelogue_entry_create", { p_travelogue_id: id, p_fields: fields } as never))) as unknown as string;
    const docs = { introduction: e.intro ?? null, narrative: e.narrative, history_notes: e.history ?? null, personal_review: e.review ?? null };
    // saveEntry ile aynı: düz metin tüm alanlardan üretilir
    const contentText = [e.title, ...Object.values(docs).map((d) => docToText(d))].filter(Boolean).join("\n\n");
    await must(`entry save ${e.title}`, db.rpc("travelogue_entry_save", {
      p_id: entryId, p_version: 1, p_force: true, p_patch: { ...docs, content_text: contentText },
    } as never));
    ids.push(entryId);
  }
  log(`  ${ids.length} yazı, ${Object.keys(content).length} bölüm`);
  return { id, entryIds: ids };
}

// ----------------------------------------------------------------------------- Ana akış
async function main() {
  demoPassword();
  log(`Demo hesabı: ${DEMO_EMAIL} · site: ${BASE_URL}`);
  const auth = await signIn();
  if ("error" in auth) {
    if (/invalid login credentials|invalid_credentials/i.test(`${auth.code} ${auth.error}`)) {
      log("Giriş başarısız (hesap yok ya da e-posta doğrulanmamış). Kayıt deneniyor…");
      const db = newClient();
      const { data, error } = await db.auth.signUp({ email: DEMO_EMAIL, password: demoPassword(), options: { data: { full_name: DEMO_NAME } } });
      if (error && !/already registered|already exists/i.test(error.message)) {
        console.error(`::error::Kayıt başarısız: ${error.message}`);
        process.exit(1);
      }
      if (data?.session) {
        log("Kayıt oturumu hemen açtı (e-posta doğrulaması kapalı); tekrar çalıştırın.");
      }
      console.log("DEMO_SIGNUP_DONE: confirm email");
      console.log(`::warning::Demo hesabı oluşturuldu ama e-postası doğrulanmadı. Supabase SQL: update auth.users set email_confirmed_at = now() where email = '${DEMO_EMAIL}'; — sonra iş akışını yeniden çalıştırın. (Hesap zaten varsa şifreyi kontrol edin.)`);
      setOutput("ready", "false");
      process.exit(0);
    }
    if (/email not confirmed/i.test(auth.error)) {
      console.log("DEMO_SIGNUP_DONE: confirm email");
      console.log(`::warning::E-posta doğrulanmamış. Supabase SQL: update auth.users set email_confirmed_at = now() where email = '${DEMO_EMAIL}';`);
      setOutput("ready", "false");
      process.exit(0);
    }
    console.error(`::error::Demo girişi başarısız: ${auth.error}`);
    process.exit(1);
  }
  const { db, userId } = auth;
  log(`Giriş tamam (${userId}).`);

  const today = todayIst();
  const d1 = saturday(addDays(today, -21), -1);
  const d3 = addDays(d1, 2);
  const planned = saturday(addDays(today, 18), 1);

  await wipe(db, userId);
  await profileAndSettings(db, userId);
  await vehicle(db, userId);
  await refinePlaces(db);
  const placeIds = await favorites(db);
  const plannedTripId = await plannedTrip(db, planned);
  const main = await mainTrip(db, userId, d1);
  const second = await secondTrip(db, userId, d3);
  await journal(db, main.id, main.moments, second, placeIds);
  const tl = await travelogue(db, main.id, main.moments, placeIds);

  const result: SeedResult = {
    userId, plannedTripId, completedTripId: main.id, secondTripId: second.id, travelogueId: tl.id, entryIds: tl.entryIds,
    createdAt: new Date().toISOString(),
  };
  writeJson(SEED_FILE, result);
  setOutput("ready", "true");
  log(`Tamam → ${SEED_FILE}`);
}

function setOutput(name: string, value: string) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) appendFileSync(f, `${name}=${value}\n`);
}

main().catch((e) => {
  console.error(`::error::Seed başarısız: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
  process.exit(1);
});
