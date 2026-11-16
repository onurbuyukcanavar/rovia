const V = "https://valhalla1.openstreetmap.de";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GEBZE = [40.8027, 29.4307], YALOVA = [40.6550, 29.2760];
async function run(name, opts, extra = {}) {
  const body = { locations: [{ lat: GEBZE[0], lon: GEBZE[1] }, { lat: YALOVA[0], lon: YALOVA[1] }], costing: "auto",
    costing_options: { auto: opts }, units: "kilometers", language: "tr-TR", alternates: 2, ...extra };
  const j = await (await fetch(`${V}/route`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
  if (!j.trip) { console.log(name, "HATA", JSON.stringify(j).slice(0, 300)); return; }
  for (const [i, t] of [j.trip, ...(j.alternates ?? []).map((a) => a.trip)].entries()) {
    const man = t.legs.flatMap((l) => l.maneuvers ?? []);
    console.log(`${name} #${i} ${t.summary.length.toFixed(1)}km ${(t.summary.time/60).toFixed(0)}dk toll=${t.summary.has_toll} ferry=${t.summary.has_ferry} lang=${j.trip.language}`);
    for (const m of man) {
      const flags = Object.entries(m).filter(([k, v]) => v === true).map(([k]) => k).join(",");
      if (flags || m.type === 28 || m.type === 29 || /feribot|vapur|ferry/i.test(m.instruction))
        console.log(`   type=${m.type} [${flags}] travel=${m.travel_mode}/${m.travel_type} len=${m.length} ${m.instruction}`);
    }
    if (i === 0) console.log("   ilk 3:", man.slice(0, 3).map((m) => m.instruction).join(" | "));
  }
  await sleep(1300);
}
await run("varsayılan+use_ferry1", { use_ferry: 1 });
await run("use_tolls0+use_ferry1", { use_tolls: 0, use_ferry: 1 });
await run("shortest", { shortest: true });
await run("exclude_highways+use_ferry1", { exclude_highways: true, use_ferry: 1 });
