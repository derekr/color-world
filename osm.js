/* Street data for Neighborhood mode, from OpenStreetMap through Overpass.

   GET /osm/14/<x>/<y>.json returns the streets, water, parks, schools and buildings in one zoom-14 map tile (about
   2.4 km across at the equator, under 2 km across the US) as GeoJSON.

   Privacy safeguards. PRIVACY.md explains them, and scripts/privacy.mjs fails the build if one goes missing:
   - The browser only talks to this site. The Worker asks Overpass itself, with a request it builds from scratch, so
     none of the visitor's headers (IP, cookies, user agent, referrer) go with it. Overpass sees Cloudflare.
   - Only whole tiles on one fixed grid can be asked for, so a request names a ~2 km square, never a point. The path
     is the whole request: a query string, another zoom or anything else is refused.
   - The Overpass query is a fixed template filled with the tile's edges; a visitor can't send their own.
   - Each shape keeps a kind and, for streets and public places, a name. House numbers, addresses, building names and
     every other tag are dropped.
   - Nothing is logged: no console calls, Workers Logs and Logpush off in wrangler.jsonc, no cookies set.
   - Tiles are cached at the edge, so most views never reach Overpass at all.

   Overpass returns each way and relation whole, even where it runs past the tile, so parks and lakes come back as
   closed shapes with no seam at the tile edge. The browser drops the copies it gets from neighbouring tiles by id. */

export const ZOOM = 14;
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const AGENT = 'color-world (https://github.com/derekr/color-world)';
const TTL = 60 * 60 * 24 * 30; // a month: streets change slowly, and every hit is one less request to Overpass
const MAX_POINTS = 20000; // a shape bigger than this (a coastline, a huge lake) is skipped rather than sent

/* /osm/14/<x>/<y>.json → { x, y }, or null for anything else */
export function tileFromUrl(url) {
  if (url.search) return null;
  const m = /^\/osm\/14\/(\d{1,5})\/(\d{1,5})\.json$/.exec(url.pathname);
  if (!m) return null;
  const x = +m[1], y = +m[2], n = 2 ** ZOOM;
  return x < n && y < n ? { x, y } : null;
}

/* The tile's edges in degrees: [south, west, north, east] */
export function tileBounds({ x, y }) {
  const n = 2 ** ZOOM;
  const lon = (i) => (i / n) * 360 - 180;
  const lat = (j) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return [lat(y + 1), lon(x), lat(y), lon(x + 1)];
}

export function query(bounds) {
  const bbox = bounds.map((v) => v.toFixed(6)).join(',');
  return `[out:json][timeout:60][bbox:${bbox}];
(
  way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|footway|path|cycleway|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  way[railway~"^(rail|light_rail|tram)$"];
  way[waterway~"^(river|stream|canal)$"];
  nwr[natural=water];
  nwr[waterway=riverbank];
  nwr[leisure~"^(park|garden|nature_reserve|playground|pitch)$"];
  nwr[amenity~"^(school|library)$"];
  way[building];
);
out geom qt;`;
}

/* An OSM element's tags → our kind, or null to leave it out */
export function kindOf(t = {}) {
  const h = t.highway;
  if (h) {
    if (/^(motorway|trunk|primary|secondary)(_link)?$/.test(h)) return 'road-big';
    if (/^(tertiary|tertiary_link|unclassified|residential|living_street|pedestrian)$/.test(h)) return 'road';
    if (h === 'service') return 'road-small';
    if (/^(footway|path|cycleway|track)$/.test(h)) return 'path';
  }
  if (t.railway) return 'rail';
  if (t.natural === 'water' || t.waterway === 'riverbank') return 'water';
  if (t.waterway) return 'stream';
  if (t.amenity === 'school') return 'school';
  if (t.amenity === 'library') return 'library';
  if (t.leisure === 'playground') return 'playground';
  if (t.leisure === 'pitch') return 'field';
  if (t.leisure) return 'park';
  if (t.building) return 'building';
  return null;
}

/* Kinds drawn as lines; the rest are areas (or a point, for a school or library mapped as one) */
const LINES = new Set(['road-big', 'road', 'road-small', 'path', 'rail', 'stream']);
/* Kinds whose name is kept: streets and public places. Never buildings (a house can carry its owners' name) or
   driveways and other service roads. */
const NAMED = new Set(['road-big', 'road', 'path', 'rail', 'stream', 'water', 'park', 'playground', 'field', 'school', 'library']);

const pt = (p) => [Math.round(p.lon * 1e5) / 1e5, Math.round(p.lat * 1e5) / 1e5]; // ~1 m, plenty for a printed page
const line = (geom) => {
  const out = [];
  for (const p of geom || []) {
    if (!p) continue; // Overpass marks members it couldn't place with null
    const q = pt(p), last = out[out.length - 1];
    if (!last || last[0] !== q[0] || last[1] !== q[1]) out.push(q);
  }
  return out;
};
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const closed = (c) => c.length >= 4 && same(c[0], c[c.length - 1]);

/* Join a relation's member ways end to end into closed rings */
export function rings(parts) {
  const pool = parts.filter((p) => p.length > 1).map((p) => p.slice());
  const out = [];
  while (pool.length) {
    let ring = pool.shift();
    while (!same(ring[0], ring[ring.length - 1])) {
      const head = ring[0], tail = ring[ring.length - 1];
      const i = pool.findIndex((p) => same(p[0], tail) || same(p[p.length - 1], tail) || same(p[0], head) || same(p[p.length - 1], head));
      if (i < 0) break;
      const p = pool.splice(i, 1)[0];
      if (same(p[0], tail)) ring = ring.concat(p.slice(1));
      else if (same(p[p.length - 1], tail)) ring = ring.concat(p.reverse().slice(1));
      else if (same(p[p.length - 1], head)) ring = p.concat(ring.slice(1));
      else ring = p.reverse().concat(ring.slice(1));
    }
    if (closed(ring)) out.push(ring);
  }
  return out;
}

const points = (c) => (typeof c[0] === 'number' ? 1 : c.reduce((n, x) => n + points(x), 0));
const inside = ([x, y], ring) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

/* Overpass JSON → a GeoJSON FeatureCollection with only { k: kind, n: name } on each feature */
export function toGeoJSON(data) {
  const features = [];
  for (const el of data.elements || []) {
    const k = kindOf(el.tags);
    if (!k) continue;
    let geometry = null;
    if (el.type === 'node') {
      if (k === 'school' || k === 'library') geometry = { type: 'Point', coordinates: pt(el) };
    } else if (el.type === 'way') {
      const c = line(el.geometry);
      if (c.length < 2) continue;
      if (LINES.has(k)) geometry = { type: 'LineString', coordinates: c };
      else if (closed(c)) geometry = { type: 'Polygon', coordinates: [c] };
    } else if (el.type === 'relation') {
      const ways = (role) => (el.members || []).filter((m) => m.type === 'way' && (m.role || 'outer') === role).map((m) => line(m.geometry));
      const polys = rings(ways('outer')).map((r) => [r]);
      for (const hole of rings(ways('inner'))) {
        const home = polys.find((p) => inside(hole[0], p[0]));
        if (home) home.push(hole);
      }
      if (polys.length) geometry = { type: 'MultiPolygon', coordinates: polys };
    }
    if (!geometry || points(geometry.coordinates) > MAX_POINTS) continue;
    const properties = { k };
    const name = el.tags.name;
    if (name && NAMED.has(k)) properties.n = name;
    features.push({ type: 'Feature', id: `${el.type[0]}${el.id}`, properties, geometry });
  }
  return { type: 'FeatureCollection', attribution: '© OpenStreetMap contributors, ODbL', features };
}

const json = (status, body, extra = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra } });

export async function osmTile(req, ctx) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const url = new URL(req.url);
  const tile = tileFromUrl(url);
  if (!tile) return json(404, '{"error":"not a tile"}');

  // Cached by the tile alone: the key is rebuilt from x and y, so nothing else about the request can reach it
  const key = new Request(`${url.origin}/osm/${ZOOM}/${tile.x}/${tile.y}.json`);
  const cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;

  // A brand-new request: none of the visitor's headers are copied onto it
  const up = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': AGENT },
    body: 'data=' + encodeURIComponent(query(tileBounds(tile))),
  }).catch(() => null);
  const data = up?.ok ? await up.json().catch(() => null) : null;
  if (!data || /error/i.test(data.remark || '')) {
    return json(503, '{"error":"street data is busy, try again in a minute"}', { 'Retry-After': '60', 'Cache-Control': 'no-store' });
  }
  const res = json(200, JSON.stringify(toGeoJSON(data)), { 'Cache-Control': `public, max-age=${TTL}` });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
