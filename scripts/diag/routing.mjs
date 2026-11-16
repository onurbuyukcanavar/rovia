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
    out.push([+(lat / f).toFixed(4), +(lng / f).toFixed(4)]);
  }
  return out;
}
async function run(name, from, to, auto, showAll = false) {
  const body = { locations: [{ lat: from[0], lon: from[1] }, { lat: to[0], lon: to[1] }], costing: "auto", costing_options: { auto },
    units: "kilometers", language: "tr-TR", alternates: 1 };
  const j = await (await fetch(`${V}/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  if (!j.trip) { console.log(`${name}: HATA ${JSON.stringify(j).slice(0, 200)}`); await sleep(1200); return; }
  for (const [i, t] of [j.trip, ...(j.alternates ?? []).map((a) => a.trip)].entries()) {
    const s = t.summary;
    console.log(`${name} #${i}: ${s.length.toFixed(1)} km ${(s.time / 60).toFixed(0)} dk toll=${s.has_toll} ferry=${s.has_ferry} hwy=${s.has_highway} bbox=[${s.min_lat?.toFixed(2)},${s.min_lon?.toFixed(2)} → ${s.max_lat?.toFixed(2)},${s.max_lon?.toFixed(2)}]`);
    for (const leg of t.legs) {
      const pts = decode(leg.shape);
      for (const m of leg.maneuvers) {
        const show = showAll ? (m.highway || /D-?100|E-?5|D100/i.test(JSON.stringify(m.street_names ?? []))) : m.toll;
        if (!show) continue;
        console.log(`   type=${m.type} toll=${!!m.toll} hwy=${!!m.highway} ferry=${!!m.ferry} len=${m.length.toFixed(1)} names=${JSON.stringify(m.street_names ?? m.begin_street_names ?? [])} ` +
          `from=${pts[m.begin_shape_index]} to=${pts[m.end_shape_index]} :: ${m.instruction}`);
      }
    }
  }
  await sleep(1300);
}
const TEKIRDAG = [40.978, 27.511], BURSA = [40.195, 29.06], KADIKOY = [40.990, 29.028], BESIKTAS = [41.043, 29.007];
const LAPSEKI = [40.344, 26.685], GELIBOLU = [40.410, 26.670], AVCILAR = [40.980, 28.720], BAKIRKOY = [40.978, 28.873], SARIYER = [41.168, 29.05], BEYKOZ = [41.13, 29.10];
await run("Kadıköy→Beşiktaş varsayılan", KADIKOY, BESIKTAS, { use_ferry: 1 });
await run("Sarıyer→Beykoz varsayılan", SARIYER, BEYKOZ, { use_ferry: 1 });
await run("Lapseki→Gelibolu varsayılan", LAPSEKI, GELIBOLU, { use_ferry: 1 });
await run("Tekirdağ→Bursa varsayılan", TEKIRDAG, BURSA, { use_ferry: 1 });
await run("Tekirdağ→Bursa exclude_tolls+ferries", TEKIRDAG, BURSA, { exclude_tolls: true, exclude_ferries: true });
await run("Tekirdağ→Bursa üçü birden", TEKIRDAG, BURSA, { exclude_tolls: true, exclude_ferries: true, exclude_highways: true });
await run("Tekirdağ→Bursa ferries+highways (toll serbest)", TEKIRDAG, BURSA, { exclude_ferries: true, exclude_highways: true });
await run("Avcılar→Bakırköy exclude_highways (D-100?)", AVCILAR, BAKIRKOY, { exclude_highways: true }, true);
await run("Avcılar→Bakırköy varsayılan (D-100?)", AVCILAR, BAKIRKOY, { use_ferry: 1 }, true);
