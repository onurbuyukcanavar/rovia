/*
 * ROVIA servis çalışanı — yalnızca çevrimdışı ekranı için.
 * - Gezinmeler: önce ağ; ağ yoksa önbellekteki /offline gösterilir.
 * - Önbelleğe yalnızca herkese açık /offline sayfası, onun CSS/yazı tipleri ve simgeler alınır.
 *   Oturum gerektiren sayfalar ve API yanıtları ASLA saklanmaz (gizlilik).
 * - GET dışı ve başka kökene giden isteklere dokunulmaz.
 */
const VERSION = "v1";
const CACHE = `rovia-offline-${VERSION}`;
const OFFLINE_URL = "/offline";
const STATIC_ASSETS = ["/icon.svg", "/icons/192", "/icons/512", "/manifest.webmanifest"];

/** /offline sayfasını ve onun bağlı olduğu stil/yazı tipi dosyalarını önbelleğe alır; eskilerini siler. */
async function precache() {
  const cache = await caches.open(CACHE);
  const res = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "omit" });
  if (!res.ok) throw new Error(`offline page ${res.status}`);
  const html = await res.clone().text();
  // Sayfa JS'siz çalışır; yalnızca CSS ve yazı tipleri gerekir
  const assets = [...html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+\.(?:css|woff2?))"/g)].map((m) => m[1]);
  const keep = new Set([OFFLINE_URL, ...STATIC_ASSETS, ...assets].map((u) => new URL(u, self.location.origin).href));
  await cache.put(OFFLINE_URL, res);
  // Hash'li dosyalar değişmez: zaten önbellekte olanlar yeniden indirilmez
  await Promise.all([...STATIC_ASSETS, ...assets].map(async (u) => {
    if (assets.includes(u) && (await cache.match(u))) return;
    await cache.add(new Request(u, { credentials: "omit" })).catch(() => undefined);
  }));
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("rovia-offline-") && key !== CACHE) await caches.delete(key);
    }
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

// Yeni sürüm yayımlandığında /offline'ın CSS adları değişir: çalışan her uyandığında bir kez tazelenir
let refreshed = false;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = (await event.preloadResponse) || (await fetch(req));
        if (!refreshed) {
          refreshed = true;
          event.waitUntil(precache().catch(() => undefined));
        }
        return res;
      } catch {
        const cached = await caches.match(OFFLINE_URL, { cacheName: CACHE, ignoreVary: true });
        return cached || new Response("Bağlantı yok", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  // Yalnızca önbelleğe bizim aldığımız dosyalar için: ağ yoksa önbellekten. Diğer her şey (Next JS
  // parçaları, API, görseller) tarayıcıya olduğu gibi bırakılır.
  const p = url.pathname;
  if (STATIC_ASSETS.includes(p) || (p.startsWith("/_next/static/") && /\.(?:css|woff2?)$/.test(p))) {
    event.respondWith(fetch(req).catch(async () => {
      const cached = await caches.match(req, { cacheName: CACHE, ignoreVary: true });
      return cached || Response.error();
    }));
  }
});
