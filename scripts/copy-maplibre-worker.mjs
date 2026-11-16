// MapLibre GL v6, harita çizimini bir Web Worker'da yapar ve worker dosyasını varsayılan olarak
// paketlenmiş JS dosyasının yanında arar (/_next/static/.../maplibre-gl-worker.mjs). Next.js
// paketleyicisi bu dosyayı oraya kopyalamaz → "Worker failed to load", harita boş kalır.
// Çözüm: worker'ı public/ altına kopyala; istemci setWorkerUrl() ile bu adresi kullanır.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const target = join(process.cwd(), "public", "maplibre");
mkdirSync(target, { recursive: true });
copyFileSync(join(pkgDir, "dist", "maplibre-gl-worker.mjs"), join(target, "maplibre-gl-worker.js"));
console.log("✓ MapLibre worker → public/maplibre/maplibre-gl-worker.js");
