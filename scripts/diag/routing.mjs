// Valhalla (FOSSGIS) rota tanılaması: feribot ve seçenekler
const V = "https://valhalla1.openstreetmap.de";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function decode(str, precision = 6) {
  let index = 0, lat = 0, lng = 0; const out = []; const f = 10 ** precision;
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / f, lng / f]);
  }
  return out;
}
const near = (pts, [la, lo], km) => pts.some(([a, b]) => Math.hypot((a - la) * 111, (b - lo) * 85) < km);
const ESKIHISAR = [40.7695, 29.4300], TOPCULAR = [40.6880, 29.4010], OSMANGAZI = [40.7550, 29.5150];
async function route(name, from, to, opts = {}, extra = {}) {
  const body = { locations: [{ lat: from[0], lon: from[1] }, { lat: to[0], lon: to[1] }], costing: "auto", costing_options: { auto: opts },
    directions_type: "maneuvers", units: "kilometers", alternates: 2, ...extra };
  const r = await fetch(`${V}/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.trip) { console.log(name, "HATA", r.status, JSON.stringify(j).slice(0, 300)); return; }
  for (const [i, t] of [j.trip, ...(j.alternates ?? []).map((a) => a.trip)].entries()) {
    const pts = t.legs.flatMap((l) => decode(l.shape));
    const ferryMan = t.legs.flatMap((l) => l.maneuvers ?? []).filter((m) => m.travel_type === "ferry" || /ferry|feribot|vapur/i.test(m.instruction ?? ""));
    console.log(`${name} #${i}: ${t.summary.length.toFixed(1)} km ${(t.summary.time / 60).toFixed(0)} dk toll=${t.summary.has_toll} ferry=${t.summary.has_ferry} highway=${t.summary.has_highway}` +
      ` eskihisar=${near(pts, ESKIHISAR, 1.5)} topcular=${near(pts, TOPCULAR, 1.5)} osmangazi=${near(pts, OSMANGAZI, 2)} ferryManeuvers=${ferryMan.map((m) => m.instruction).join(" | ")}`);
  }
  await sleep(1200);
}
const st = await (await fetch(`${V}/status?verbose=true`)).json().catch(() => ({}));
console.log("status:", JSON.stringify(st).slice(0, 400));
await sleep(1200);
// Feribot iskelelerinin yakınındaki kenarlar
for (const [n, p] of [["eskihisar", ESKIHISAR], ["topcular", TOPCULAR]]) {
  const r = await fetch(`${V}/locate`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locations: [{ lat: p[0], lon: p[1] }], costing: "auto", verbose: true }) });
  const j = await r.json();
  const edges = (j[0]?.edges ?? []).map((e) => `${e.edge_info?.names?.join("/") ?? ""} use=${e.edge?.use} ferry=${e.edge?.use === "ferry"} dist=${e.distance?.toFixed?.(0)}`);
  console.log("locate", n, edges.slice(0, 6).join(" || ") || JSON.stringify(j).slice(0, 300));
  await sleep(1200);
}
const GEBZE = [40.8027, 29.4307], YALOVA = [40.6550, 29.2760], KADIKOY = [40.9900, 29.0280], BURSA = [40.1950, 29.0600], ALTINOVA = [40.6960, 29.5100];
await route("Gebze→Yalova varsayılan", GEBZE, YALOVA);
await route("Gebze→Yalova use_ferry=1", GEBZE, YALOVA, { use_ferry: 1 });
await route("Gebze→Yalova use_tolls=0", GEBZE, YALOVA, { use_tolls: 0 });
await route("Gebze→Yalova exclude_tolls", GEBZE, YALOVA, { exclude_tolls: true });
await route("Gebze→Yalova use_ferry=1 use_tolls=0", GEBZE, YALOVA, { use_ferry: 1, use_tolls: 0 });
await route("Gebze→Yalova shortest", GEBZE, YALOVA, { shortest: true });
await route("Kadıköy→Bursa varsayılan", KADIKOY, BURSA);
await route("Kadıköy→Bursa use_ferry=1 use_tolls=0", KADIKOY, BURSA, { use_ferry: 1, use_tolls: 0 });
await route("Kadıköy→Bursa exclude_tolls+ferry", KADIKOY, BURSA, { exclude_tolls: true, use_ferry: 1 });
await route("Kadıköy→Bursa use_highways=0", KADIKOY, BURSA, { use_highways: 0 });
await route("Kadıköy→Bursa exclude_ferries", KADIKOY, BURSA, { exclude_ferries: true });
await route("Eskihisar→Topçular (doğrudan)", [40.7700, 29.4290], [40.6870, 29.4020]);
await route("Gebze→Altınova varsayılan", GEBZE, ALTINOVA);
await route("Ankara→Göreme use_highways=0", [39.92, 32.85], [38.643, 34.829], { use_highways: 0 });
await route("Ankara→Göreme exclude_highways", [39.92, 32.85], [38.643, 34.829], { exclude_highways: true });
