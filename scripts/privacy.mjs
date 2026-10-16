#!/usr/bin/env node
/* Check the privacy safeguards PRIVACY.md promises, and fail the build if one is missing.

   Runs as the first half of wrangler's custom build (wrangler.jsonc), so every deploy, preview and `wrangler dev`
   runs it. Run it by hand with: node scripts/privacy.mjs

   What it checks:
   - The page (index.html, app.js, datasets.js, locales/) names no other site: every http(s) URL is one of ours, the
     SVG namespace, or a plain link listed in LINKS. Scripts, fonts and data are all served from this site.
   - The page never reads location, sets cookies or sends beacons: no navigator.geolocation, document.cookie,
     sendBeacon, WebSocket, EventSource or RTCPeerConnection.
   - worker.js and osm.js never call console, so nothing about a request can end up in a log.
   - osm.js makes exactly one outbound request, to Overpass, and never reads the visitor's request headers.
   - wrangler.jsonc keeps Workers Logs and Logpush off, with no tail Workers or Analytics Engine.
   - osm.js only accepts /osm/14/<x>/<y>.json, and the shapes it sends carry only a kind and, for streets and public
     places, a name: no addresses, house numbers or building names. Tested against a sample Overpass reply below.
   - Sending a tile request full of identifying headers (IP, cookie, referrer, user agent) through osm.js, with fetch
     stood in for: what would reach Overpass carries only our content type and user agent, and the cache key is the
     tile alone. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const errors = [];
let passed = 0;
const check = (ok, msg) => (ok ? passed++ : errors.push(msg));

// ---- the page
const OURS = ['color-world.perfectdays.dev', 'colour-world.perfectdays.dev'];
const NAMESPACES = ['www.w3.org']; // xmlns attributes, never fetched
const LINKS = []; // hosts the page only links to (an <a href> the visitor chooses to follow), never loads from
const page = ['index.html', 'app.js', 'datasets.js', ...readdirSync(join(root, 'locales')).map((f) => `locales/${f}`)];
for (const f of page) {
  const src = read(f);
  for (const [, host] of src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    check([...OURS, ...NAMESPACES, ...LINKS].includes(host.toLowerCase()), `${f}: names another site, ${host}. The page must only load from this site (PRIVACY.md).`);
  }
  for (const api of ['navigator.geolocation', 'document.cookie', 'sendBeacon', 'WebSocket', 'EventSource', 'RTCPeerConnection']) {
    check(!src.includes(api), `${f}: uses ${api} (PRIVACY.md: no location, cookies or beacons)`);
  }
}

// ---- the Worker
const worker = read('worker.js'), osm = read('osm.js');
for (const [f, src] of [['worker.js', worker], ['osm.js', osm]]) check(!/\bconsole\s*\./.test(src), `${f}: calls console. Nothing about a request may be logged (PRIVACY.md).`);
const fetches = [...osm.matchAll(/\bfetch\s*\(([^,)]*)/g)].map((m) => m[1].trim());
check(fetches.length === 1 && fetches[0] === 'OVERPASS', `osm.js: must make exactly one request, fetch(OVERPASS, …); found ${fetches.length ? fetches.join(', ') : 'none'}`);
check(!/\breq(uest)?\s*\.\s*headers\b/.test(osm), 'osm.js: reads the visitor\'s request headers; the Overpass request must be built from scratch (PRIVACY.md)');
check(/const OVERPASS = 'https:\/\/overpass-api\.de\/api\/interpreter';/.test(osm), 'osm.js: OVERPASS must stay the public Overpass endpoint, or PRIVACY.md must be updated to name the new one');

const wrangler = read('wrangler.jsonc');
check(/"observability"\s*:\s*\{\s*"enabled"\s*:\s*false\s*\}/.test(wrangler), 'wrangler.jsonc: "observability": { "enabled": false } is missing (Workers Logs must stay off)');
check(/"logpush"\s*:\s*false/.test(wrangler), 'wrangler.jsonc: "logpush": false is missing');
for (const key of ['tail_consumers', 'analytics_engine_datasets']) check(!wrangler.includes(`"${key}"`), `wrangler.jsonc: ${key} would send request data elsewhere`);

// ---- osm.js behaviour
const { tileFromUrl, toGeoJSON } = await import(pathToFileURL(join(root, 'osm.js')));
const u = (p) => new URL('https://color-world.perfectdays.dev' + p);
check(JSON.stringify(tileFromUrl(u('/osm/14/2621/6331.json'))) === '{"x":2621,"y":6331}', 'osm.js: rejects a valid tile');
for (const bad of ['/osm/14/2621/6331.json?lat=1', '/osm/15/2621/6331.json', '/osm/14/16384/0.json', '/osm/14/2621/6331.json/x', '/osm/14/-1/0.json', '/osm/14/1.5/0.json', '/osm/14/2621/6331']) {
  check(tileFromUrl(u(bad)) === null, `osm.js: accepts ${bad}; only /osm/14/<x>/<y>.json may reach Overpass`);
}

const g = (...pts) => pts.map(([lon, lat]) => ({ lon, lat }));
const sq = (x, y, s) => g([x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]);
const sample = { elements: [
  { type: 'way', id: 1, tags: { highway: 'residential', name: 'Maple Avenue' }, geometry: g([0, 0], [0.01, 0]) },
  { type: 'way', id: 2, tags: { highway: 'service', service: 'driveway', name: 'The Smiths\' drive' }, geometry: g([0, 0], [0, 0.001]) },
  { type: 'way', id: 3, tags: { building: 'house', name: 'Smith House', 'addr:housenumber': '42', 'addr:street': 'Maple Avenue', 'addr:postcode': '12345', phone: '555-0100' }, geometry: sq(0, 0, 0.0002) },
  { type: 'node', id: 4, lat: 0.005, lon: 0.005, tags: { amenity: 'school', name: 'Hillside School', 'addr:housenumber': '7', website: 'https://example.org' } },
  { type: 'relation', id: 5, tags: { type: 'multipolygon', natural: 'water', name: 'Mill Pond' }, members: [
    { type: 'way', role: 'outer', geometry: g([0, 0], [0.01, 0], [0.01, 0.01]) },
    { type: 'way', role: 'outer', geometry: g([0.01, 0.01], [0, 0.01], [0, 0]) },
    { type: 'way', role: 'inner', geometry: sq(0.004, 0.004, 0.002) },
  ] },
  { type: 'node', id: 6, lat: 1, lon: 1, tags: { 'addr:housenumber': '9', 'addr:street': 'Oak Street' } },
] };
const out = toGeoJSON(sample);
const byId = Object.fromEntries(out.features.map((f) => [f.id, f]));
check(out.features.every((f) => Object.keys(f.properties).every((k) => k === 'k' || k === 'n')), 'osm.js: a feature carries properties other than kind and name');
check(!JSON.stringify(out).match(/42|12345|555|Smith|example\.org|Oak Street/), 'osm.js: an address, house number, phone, website or private name made it into the output');
check(byId.w1?.properties.n === 'Maple Avenue', 'osm.js: street names should be kept');
check(byId.w2 && !('n' in byId.w2.properties), 'osm.js: driveway names must be dropped');
check(byId.w3 && !('n' in byId.w3.properties), 'osm.js: building names must be dropped');
check(byId.r5?.geometry.type === 'MultiPolygon' && byId.r5.geometry.coordinates[0].length === 2, 'osm.js: a lake with an island should come back as one closed shape with a hole');
check(!byId.n6, 'osm.js: a bare address point must be left out');

// ---- the request osm.js sends: a visitor's request full of identifying headers goes in; what reaches Overpass must
// carry none of them. fetch and the edge cache are stood in for, so this runs offline.
const { osmTile } = await import(pathToFileURL(join(root, 'osm.js')));
const sent = [], stored = [];
globalThis.caches = { default: { match: async () => undefined, put: async (k) => void stored.push(k.url) } };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  sent.push({ url: String(url), headers: Object.fromEntries(new Headers(init.headers)), body: String(init.body) });
  return new Response(JSON.stringify(sample), { headers: { 'Content-Type': 'application/json' } });
};
const visitor = new Request('https://color-world.perfectdays.dev/osm/14/2621/6331.json', { headers: {
  'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7', 'true-client-ip': '203.0.113.7',
  cookie: 'id=kid-123', referer: 'https://color-world.perfectdays.dev/?near=42-maple-ave', 'user-agent': 'KidTablet/1.0', 'accept-language': 'en-US',
} });
const waits = [];
const res = await osmTile(visitor, { waitUntil: (p) => waits.push(p) });
await Promise.all(waits);
globalThis.fetch = realFetch;
check(res.status === 200, `osm.js: a valid tile returned ${res.status}`);
check(!res.headers.has('set-cookie'), 'osm.js: responses must not set cookies');
check(sent.length === 1 && sent[0].url === 'https://overpass-api.de/api/interpreter', 'osm.js: must make exactly one request, to Overpass');
const hdrs = sent[0]?.headers || {};
check(JSON.stringify(Object.keys(hdrs).sort()) === '["content-type","user-agent"]', `osm.js: the Overpass request may only carry content-type and user-agent; it had ${Object.keys(hdrs).join(', ')}`);
check(hdrs['user-agent']?.startsWith('color-world '), 'osm.js: the Overpass request must carry our user agent, not the visitor\'s');
check(!/203\.0\.113\.7|kid-123|maple|KidTablet|en-US/i.test(JSON.stringify(sent)), 'osm.js: something from the visitor\'s request reached Overpass');
check(stored.length === 1 && stored[0] === 'https://color-world.perfectdays.dev/osm/14/2621/6331.json', 'osm.js: the cache key must be the tile and nothing else');

if (errors.length) {
  console.error(`Privacy check failed (${errors.length}):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`Privacy check: ${passed} checks passed`);
