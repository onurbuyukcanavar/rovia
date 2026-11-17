#!/usr/bin/env node
/**
 * Performans bütçesi: `next build` sonrası ana rotaların First Load JS (gzip) boyutlarını
 * .next/diagnostics/route-bundle-stats.json üzerinden ölçer ve bütçeyi aşan rota varsa
 * sıfır olmayan kodla çıkar. Bütçeler ölçülen değerler + ~%10 pay ile belirlendi.
 *
 *   node scripts/perf-budget.mjs           → tablo + bütçe kontrolü
 *   node scripts/perf-budget.mjs --json    → makine okunur çıktı
 *   node scripts/perf-budget.mjs --modules → büyük kütüphanelerin hangi rotada olduğunu da gösterir
 */
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const statsPath = path.join(root, ".next/diagnostics/route-bundle-stats.json");

/** KB (gzip) cinsinden First Load JS bütçeleri — 2026-11 ölçümleri + ~%10 pay. Bilinçli büyümede güncelleyin. */
const BUDGETS_KB = {
  "/": 177,
  "/giris": 175,
  "/panel": 181,
  "/harita": 225,
  "/planla": 225,
  "/yolculuklar": 186,
  "/yolculuklar/[id]": 220,
  "/gunluk": 196,
  "/seyahatnameler": 190,
  "/seyahatnameler/[id]": 219,
  "/seyahatnameler/[id]/yazi/[entryId]": 209,
  "/seyahatnameler/[id]/oku": 199,
  "/kesfet": 212,
  "/garaj": 186,
  "/favoriler": 207,
  "/p/[token]": 188,
};

/** İlk yüklemede asla bulunmaması gereken ağır kütüphaneler (rota → izinli değil). */
const HEAVY = {
  // Çekirdek kütüphanelere özgü metinler (sarmalayıcıların içe aktarma dizgeleri değil)
  maplibre: /Style is not done loading/,
  tiptap: /ProseMirror-/,
  "react-pdf": /PDFKit|pdfkit/,
  exifr: /ExifIFD|exifr/,
  "supabase-js": /GoTrueClient/,
};

if (!existsSync(statsPath)) {
  console.error(`[perf-budget] ${statsPath} bulunamadı — önce \`next build\` çalıştırın.`);
  process.exit(2);
}

const stats = JSON.parse(readFileSync(statsPath, "utf8"));
const gzCache = new Map();
const srcCache = new Map();
const read = (p) => {
  if (!srcCache.has(p)) srcCache.set(p, readFileSync(path.join(root, p)));
  return srcCache.get(p);
};
const gz = (p) => {
  if (!gzCache.has(p)) gzCache.set(p, gzipSync(read(p), { level: 9 }).length);
  return gzCache.get(p);
};

const rows = [];
for (const entry of stats) {
  const files = entry.firstLoadChunkPaths ?? [];
  const gzipBytes = files.reduce((n, f) => n + gz(f), 0);
  const heavy = Object.entries(HEAVY)
    .filter(([, re]) => files.some((f) => re.test(read(f).toString("latin1"))))
    .map(([k]) => k);
  rows.push({
    route: entry.route,
    rawKB: +(entry.firstLoadUncompressedJsBytes / 1024).toFixed(1),
    gzipKB: +(gzipBytes / 1024).toFixed(1),
    budgetKB: BUDGETS_KB[entry.route],
    heavy,
  });
}
rows.sort((a, b) => a.route.localeCompare(b.route));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const showMods = process.argv.includes("--modules");
  console.log("Rota".padEnd(42) + "ham KB".padStart(10) + "gzip KB".padStart(10) + "bütçe".padStart(8) + (showMods ? "  ağır" : ""));
  for (const r of rows) {
    const flag = r.budgetKB && r.gzipKB > r.budgetKB ? "  ✗" : "";
    console.log(
      r.route.padEnd(42) +
        String(r.rawKB).padStart(10) +
        String(r.gzipKB).padStart(10) +
        String(r.budgetKB ?? "-").padStart(8) +
        (showMods ? "  " + r.heavy.join(",") : "") +
        flag,
    );
  }
}

const failures = [];
for (const [route, budget] of Object.entries(BUDGETS_KB)) {
  const r = rows.find((x) => x.route === route);
  if (!r) failures.push(`${route}: build çıktısında bulunamadı`);
  else if (r.gzipKB > budget) failures.push(`${route}: ${r.gzipKB} KB > bütçe ${budget} KB`);
  else if (r?.heavy.length) failures.push(`${route}: ilk yüklemede ağır kütüphane: ${r.heavy.join(", ")}`);
}
if (failures.length) {
  console.error("\n[perf-budget] BÜTÇE AŞILDI:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("\n[perf-budget] Tüm rotalar bütçe içinde.");
