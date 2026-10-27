/* Service worker: makes the app installable and lets it run offline.

   - Install caches everything the app can ask for, so later visits work with no network, including the parts that
     only load on demand (the detailed world and county outlines, the PDF libraries, the Add data samples), plus the
     page the visitor is on.
   - Versioned files (?v=<hash>, added on deploy by scripts/stamp.mjs, which also stamps the list below) never change,
     so they come from the cache first. Caching one drops the older versions of the same file.
   - Everything else, pages included, goes to the network first and falls back to the cache when offline, so a deploy
     shows up on the next load and the unstamped files of a local server never go stale.
   Any change to this file (a new hash in the list below on every deploy that touches an asset) installs a new worker,
   which recaches what changed and takes over right away. */
const CACHE = 'color-world';
const ASSETS = [
  '/app.js',
  '/datasets.js',
  '/vendor/datastar-rocket.js',
  '/vendor/leaflet.js',
  '/vendor/leaflet.css',
  '/vendor/topojson-client.min.js',
  '/vendor/html2canvas.min.js',
  '/vendor/jspdf.umd.min.js',
  '/fonts/baloo-2-latin-600-normal.woff2',
  '/fonts/baloo-2-latin-700-normal.woff2',
  '/fonts/baloo-2-latin-800-normal.woff2',
  '/data/world-110m.json',
  '/data/world-50m.json',
  '/data/states-10m.json',
  '/data/counties-10m.json',
  '/data/world-labels.json',
  '/data/labels.json',
  '/data/world-provinces-50m.json',
  '/data/world-capitals.json',
  '/data/capitals.json',
  '/data/continents.json',
  '/data/tornadoes.json',
  '/samples/state-capitals.csv',
  '/samples/world-capitals.geojson',
  '/samples/national-parks.geojson',
  '/samples/us-regions.geojson',
  '/samples/route-66.geojson',
  '/samples/road-trip.geojson',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
];

const versioned = (url) => url.searchParams.has('v');
const opts = { ignoreVary: true };
/* one copy per file: drop cached versions of the same path under another ?v= */
const prune = async (cache, url) => {
  for (const req of await cache.keys(url.pathname, { ...opts, ignoreSearch: true })) if (req.url !== url.href) await cache.delete(req);
};
const put = async (cache, req, res) => {
  const url = new URL(req.url || req);
  await cache.put(req, res);
  if (versioned(url)) await prune(cache, url);
};

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  /* the pages open right now (the one that registered this worker): it loaded before the worker could see it */
  const pages = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .map((c) => new URL(c.url)).filter((u) => u.origin === location.origin).map((u) => u.origin + u.pathname);
  await Promise.all([...new Set(pages), ...ASSETS].map(async (path) => {
    const req = new Request(path, { cache: 'no-cache' });
    if (versioned(new URL(req.url)) && await cache.match(req, opts)) return; /* unchanged since the last worker */
    const res = await fetch(req);
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    if (!res.redirected) await put(cache, new Request(path), res);
  }));
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (versioned(url)) {
      const hit = await cache.match(req, opts);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) e.waitUntil(put(cache, req, res.clone()));
      return res;
    }
    /* pages are kept by path alone, so a share link's query or hash doesn't matter */
    const nav = req.mode === 'navigate', key = nav ? url.origin + url.pathname : req;
    try {
      const res = await fetch(req);
      /* a redirect (/en-gb/ on the live hosts) can't answer a navigation from the cache */
      if (res.ok && res.type === 'basic' && !res.redirected) e.waitUntil(put(cache, key, res.clone()));
      return res;
    } catch (err) {
      /* offline: any page falls back to / */
      const hit = await cache.match(key, opts) || (nav && await cache.match('/', opts));
      if (hit) return hit;
      throw err;
    }
  })());
});
