/* ---------- My data: drop a GeoJSON / TopoJSON / CSV file on the map and we guess how to draw it in coloring-page style.
   Loaded as its own module (modulepreloaded by index.html); it brings its own CSS and the drop zone + sheet elements,
   and keeps added datasets in IndexedDB so they survive a reload. ---------- */
import { mergePatch, root } from './vendor/datastar-rocket.js';

const i18n = (s, vars) => ((window.I18N && window.I18N[s]) || s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)); /* see app.js */
const patch = (o) => mergePatch(o);
const app = await new Promise((r) => { const t = () => (window.app ? r(window.app) : setTimeout(t, 40)); t(); });
const map = app.map;

const style = document.createElement('style');
style.textContent = `.drop{position:absolute;inset:14px;z-index:1400;display:none;align-items:center;justify-content:center;border:4px dashed var(--ink);border-radius:28px;background:rgba(255,251,242,.92);pointer-events:none}
.drop.on{display:flex}
.drop-in{display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 34px;border:2px solid var(--ink);border-radius:26px;background:#fff;box-shadow:0 5px 0 var(--ink);text-align:center;animation:bob 1s ease-in-out infinite alternate}
.drop-in b{font-size:28px;font-weight:800}
.drop-in span{font-size:16px;font-weight:600;color:var(--muted);max-width:300px}
@keyframes bob{to{transform:translateY(-6px)}}
.tile.add{border-style:dashed;box-shadow:none;background:var(--paper)}
.tw .gear{position:absolute;top:4px;left:4px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;padding:0;border:2px solid var(--ink);border-radius:9px;background:#fff;cursor:pointer}
.tw .gear svg{width:14px;height:14px}
.tile .kind{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);display:none}
.tile.new{animation:pop .5s cubic-bezier(.3,1.6,.5,1)}
@keyframes pop{0%{transform:scale(.6)}100%{transform:none}}
.my-empty{grid-column:1/-1;margin:2px 2px 0;font-size:14px;font-weight:600;color:var(--muted);line-height:1.3}
.samples{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.samples .tile{aspect-ratio:auto;height:78px;--ic:30px;--tnh:24px;--tnf:12px;padding:4px 3px 4px}
.sub-note{margin:4px 2px 12px;font-size:15px;font-weight:600;color:var(--muted);line-height:1.3}
.sub-h{margin:14px 2px 8px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.pickbtn{width:100%;background:var(--accent)}
/* the "add to map" sheet */
.ds{position:fixed;z-index:1150;top:86px;left:20px;width:298px;max-height:calc(100vh - 106px);max-height:calc(100dvh - 106px);overflow:auto;padding:16px;border:2px solid var(--ink);border-radius:22px;background:#fff;box-shadow:0 5px 0 var(--ink);display:none;flex-direction:column;gap:10px}
.ds.on{display:flex}
.ds-head{display:flex;align-items:center;gap:10px}
.ds-head .ic{flex:none;width:52px;height:52px;border:2px solid var(--ink);border-radius:14px;background:var(--paper);padding:3px}
.ds-head .field{font-size:20px;font-weight:800;height:44px;padding:0 10px}
.ds-found{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:1px 10px 0;border:2px solid var(--ink);border-radius:999px;background:var(--paper);font-size:14px;font-weight:700}
.chip svg{width:16px;height:16px}
.ds-why{margin:-2px 2px 0;font-size:13.5px;font-weight:600;color:var(--muted);line-height:1.3}
.ds-sec{display:flex;flex-direction:column;gap:6px;padding-top:10px;border-top:2px dashed var(--track)}
.ds-sec>label,.ds-sec>.lab{font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ds .seg button{min-width:0;min-height:40px;padding:0 2px;font-size:13px;flex-direction:column;gap:0}
.ds .seg button svg{width:22px;height:22px}
.ds select.field{height:42px;font-size:16px;padding:0 10px}
.ds .toggle{min-height:40px;font-size:16px}
.ds-acts{display:flex;gap:8px;padding-top:4px}
.ds-acts .btn{flex:1;height:46px;padding:0 10px;font-size:16px;white-space:nowrap}
.ds-acts .go{background:var(--accent)}
.ds-acts .del{flex:0 0 auto;padding:0 12px}
.ds-err{padding:10px 12px;border:2px solid var(--ink);border-radius:14px;background:#FFE3DA;font-size:15px;font-weight:700;line-height:1.3}
/* how custom data draws on the map */
.dmk{position:absolute;left:0;top:0;transform:translate(-50%,-50%);pointer-events:none;display:block}
.dmk.pin{transform:translate(-50%,-100%)}
.dnum{position:absolute;left:0;top:0;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:1px 5px 0;white-space:nowrap;border:2px solid var(--ink);border-radius:50%;background:#fff;font-size:12px;font-weight:800;line-height:1;padding-top:1px}
.dl{position:absolute;left:0;top:0;transform:translate(11px,-50%);white-space:nowrap;line-height:1;pointer-events:none}
.dl.c{transform:translate(-50%,-50%)}
.dl{--k:1;--fs:12px}
.hollow .dl{--fs:14px}
.dl.big{--fs:15px}
.hollow .dl.big{--fs:17px}
.dl.z-s{--k:.8}
.dl.z-l{--k:1.45}
.dl .nm,.hollow .dl .nm{font-size:calc(var(--fs) * var(--k))}
.dl.big .nm{font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.dl.stack{display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.dl.c.stack{align-items:center}
.dl.stack .nm+.nm,.hollow .dl.stack .nm+.nm{font-size:calc(var(--fs) * var(--k) * .82)}
/* label looks you can pick under "Write names"; Plain follows the map's Outline letters setting, the rest always look the same */
.dl.s-bubble .nm{color:#fff;-webkit-text-stroke:1.1px var(--ink);paint-order:stroke fill;font-weight:800;letter-spacing:.04em;text-shadow:none}
.dl.s-bubble:not(.big){--fs:14px}
.dl.s-caps .nm{font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--ink);-webkit-text-stroke:0;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 2px #fff}
.dl.s-tag{padding:4px 7px 2px;border:1.5px solid var(--ink);border-radius:8px;background:#fff}
.dl.s-tag .nm{color:var(--ink);-webkit-text-stroke:0;text-shadow:none;font-weight:800}
.dl.s-tag:not(.big){--fs:13px}
.dl.s-tag:not(.c){transform:translate(14px,-50%)}
.ds .chips{display:flex;flex-wrap:wrap;gap:6px;max-height:132px;overflow:auto;padding:2px}
.ds .chips button{position:relative;height:32px;padding:1px 12px 0;border:2px solid var(--ink);border-radius:999px;background:#fff;font-size:14px;font-weight:700;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ds .chips button[aria-pressed="true"]{background:var(--accent);padding-left:6px}
.ds .chips b{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:5px;border-radius:50%;background:var(--ink);color:#fff;font-size:11px;line-height:1;padding-top:1px}
.ds .seg .aa{font-size:19px;line-height:22px;height:22px;font-weight:800;color:var(--ink)}
.ds .seg .aa.bubble{color:#fff;-webkit-text-stroke:1.1px var(--ink);paint-order:stroke fill}
.ds .seg .aa.caps{font-size:13px;letter-spacing:.12em}
.ds .seg .aa.tag{font-size:13px;line-height:18px;height:20px;padding:1px 5px 0;border:1.5px solid var(--ink);border-radius:6px;background:#fff}
.ds-lbl{display:flex;flex-direction:column;gap:6px}
.ds-lbl .lab{font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:4px}
@media (max-width:699px), (max-width:1099px) and (max-height:499px){
  .ds{left:0;right:0;top:auto;bottom:0;width:auto;max-height:75dvh;border:0;border-top:2px solid var(--ink);border-radius:28px 28px 0 0;box-shadow:none;z-index:1260;padding:14px 20px calc(20px + env(safe-area-inset-bottom))}
  .samples{grid-template-columns:repeat(3,minmax(0,1fr))}
}
body.printing .drop,body.printing .ds{display:none!important}
`;
document.head.appendChild(style);
const INK = '#1E1B18';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CK = '<svg class="ck" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="#1E1B18"/><path d="M6 11.5l3.5 3.5L16 8" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.6" fill="#fff"/><circle cx="15" cy="17" r="2.6" fill="#fff"/></svg>';
const STAR_D = 'M12 2.5l2.8 5.8 6.4.9-4.6 4.4 1.1 6.3L12 16.9l-5.7 3 1.1-6.3-4.6-4.4 6.4-.9z';
const PIN_D = 'M12 27C12 27 3 17 3 10a9 9 0 0118 0c0 7-9 17-9 17z';
const KIND_IC = {
  point: '<svg viewBox="0 0 24 24" fill="#fff" stroke="#1E1B18" stroke-width="2.4"><circle cx="12" cy="12" r="6"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="2.6" stroke-linecap="round"><path d="M3 18c4-10 8 2 11-6s5-4 7-6"/></svg>',
  poly: '<svg viewBox="0 0 24 24" fill="#fff" stroke="#1E1B18" stroke-width="2.4" stroke-linejoin="round"><path d="M4 7l8-4 8 5-2 11-10 2z"/></svg>'
};
const famOf = (g) => (!g ? null : /Point/.test(g.type) ? 'point' : /LineString/.test(g.type) ? 'line' : /Polygon/.test(g.type) ? 'poly' : null);

/* ---------- 1. read whatever was dropped into one list of features ---------- */
function toFeatures(j) {
  if (Array.isArray(j)) return j.flatMap(toFeatures);
  if (!j || typeof j !== 'object') return [];
  const geom = (g, props) => g.type === 'GeometryCollection' ? g.geometries.flatMap((x) => geom(x, props)) : [{ type: 'Feature', properties: props || {}, geometry: g }];
  switch (j.type) {
    case 'FeatureCollection': return (j.features || []).flatMap(toFeatures);
    case 'Feature': return j.geometry ? geom(j.geometry, j.properties) : [];
    case 'Topology': return Object.values(j.objects || {}).flatMap((o) => toFeatures(topojson.feature(j, o)));
    case 'Point': case 'MultiPoint': case 'LineString': case 'MultiLineString': case 'Polygon': case 'MultiPolygon': case 'GeometryCollection': return geom(j);
  }
  return [];
}
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',' || ch === '\t') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur); return out.map((s) => s.trim());
}
function csvFeatures(text) {
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsv(rows.shift() || '');
  const li = head.findIndex((h) => /^(lat|latitude|y)$/i.test(h)), gi = head.findIndex((h) => /^(lon|lng|long|longitude|x)$/i.test(h));
  if (li < 0 || gi < 0) throw new Error(i18n('This spreadsheet needs a latitude column and a longitude column so we know where each row goes.'));
  return rows.map((r) => {
    const c = splitCsv(r), props = {};
    head.forEach((h, i) => { if (i !== li && i !== gi) props[h] = isNaN(+c[i]) || c[i] === '' ? c[i] : +c[i]; });
    return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [+c[gi], +c[li]] } };
  }).filter((f) => isFinite(f.geometry.coordinates[0]) && isFinite(f.geometry.coordinates[1]));
}
function readFile(text, fname) {
  const t = text.trim();
  if (/\.(kml|gpx|shp|zip|kmz)$/i.test(fname)) throw new Error(i18n('KML, GPX and shapefiles are on the plan, but this mockup only reads GeoJSON, TopoJSON and CSV.'));
  if (t[0] === '{' || t[0] === '[') {
    let j; try { j = JSON.parse(t); } catch (e) { throw new Error(i18n('This looks like a JSON file, but it is broken or cut off, so we could not read it.')); }
    return { features: toFeatures(j), title: (j && typeof j.name === 'string' && j.name) || null };
  }
  if (/\.(csv|tsv|txt)$/i.test(fname) || /,|\t/.test(t.split('\n')[0])) return { features: csvFeatures(t), title: null };
  throw new Error(i18n('We could not find any map shapes in that file.'));
}

/* ---------- 2. look at it and guess a good way to draw it ---------- */
const NAME_KEYS = ['name', 'title', 'label', 'city', 'place', 'NAME', 'Name', 'NAME_EN', 'name_en', 'STATE_NAME', 'ADMIN'];
const ORDER_KEYS = /^(day|order|stop|step|seq|sequence|index|number|num|rank)$/i;
const walk = (c, fn) => (typeof c[0] === 'number' ? fn(c) : c.forEach((x) => walk(x, fn)));
const pretty = (f) => f.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w+/g, (w) => (/^(us|usa|uk|nyc|la)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
function analyze(features, fname, title) {
  const n = { point: 0, line: 0, poly: 0 }; let pts = 0;
  const bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) {
    const k = famOf(f.geometry); if (!k) continue; n[k]++;
    walk(f.geometry.coordinates, (p) => { if (k === 'point') pts++; bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
  }
  /* data that crosses the date line (Alaska's Aleutians, Fiji...) would stretch around the whole world: shift the east side west */
  let lo2 = Infinity, hi2 = -Infinity;
  for (const f of features) if (famOf(f.geometry)) walk(f.geometry.coordinates, (p) => { const x = p[0] > 0 ? p[0] - 360 : p[0]; lo2 = Math.min(lo2, x); hi2 = Math.max(hi2, x); });
  if (bb[2] - bb[0] > 180 && hi2 - lo2 < bb[2] - bb[0] - 1) {
    for (const f of features) if (famOf(f.geometry)) walk(f.geometry.coordinates, (p) => { if (p[0] > 0) p[0] -= 360; });
    bb[0] = lo2; bb[2] = hi2;
  }
  if (!n.point && !n.line && !n.poly) throw new Error(i18n('We could not find any places, lines or areas in that file.'));
  if (bb[0] < -360 || bb[2] > 360 || bb[1] < -90.5 || bb[3] > 90.5) throw new Error(i18n('This file uses a kind of map coordinates we can not read yet. Saving it again as GeoJSON in latitude and longitude (WGS84) will fix it.'));
  /* which property holds the names, and is there an order (day 1, day 2...) */
  const keys = new Map();
  for (const f of features.slice(0, 300)) for (const [k, v] of Object.entries(f.properties || {})) {
    if (v == null || typeof v === 'object') continue;
    const e = keys.get(k) || { str: 0, num: 0, vals: new Set(), len: 0 };
    typeof v === 'number' ? e.num++ : (e.str++, e.len += String(v).length); e.vals.add(v); keys.set(k, e);
  }
  const strKeys = [...keys].filter(([, e]) => e.str).map(([k]) => k);
  let nameKey = NAME_KEYS.find((k) => keys.has(k) && keys.get(k).str) || strKeys.find((k) => /name/i.test(k)) ||
    strKeys.find((k) => { const e = keys.get(k); return e.vals.size >= e.str * 0.8 && e.len / e.str < 28; }) || '';
  const orderKey = [...keys].find(([k, e]) => ORDER_KEYS.test(k) && e.num)?.[0] || '';
  const name = title || pretty(fname);
  const trip = /trail|route|path|trip|drive|walk|hike|run|ride|journey|tour/i.test(name);
  const why = [];
  const cfg = { name, labelKeys: nameKey ? [nameKey] : [], ljoin: 'line', lstyle: 'plain', lsize: 'm', labels: false, pt: 'dot', line: trip ? 'dash' : 'solid', lw: 2.5, pw: 2, orderKey };
  const labelable = n.point + n.poly + n.line;
  cfg.labels = !!nameKey && labelable <= 60 && pts <= 40;
  if (n.point) {
    if (orderKey && pts <= 40) { cfg.pt = 'num'; why.push(i18n('The places have a “{key}” number, so we numbered them in order.', { key: orderKey })); }
    else if (pts <= 40) { cfg.pt = 'star'; why.push(i18n('Only {n} places, so each one gets a big star to color.', { n: pts })); }
    else { cfg.pt = 'dot'; why.push(nameKey ? i18n('{n} places is a lot, so they are small dots with no names, so the page stays readable.', { n: pts }) : i18n('{n} places is a lot, so they are small dots.', { n: pts })); }
  }
  if (n.line) why.push(trip ? i18n('It sounds like a trip, so lines are dashed like a route.') : i18n('Lines are drawn in the same ink as the map.'));
  if (n.poly) why.push(i18n('Areas get an outline you can color inside.'));
  if (nameKey && cfg.labels) why.push(i18n('Names come from the “{key}” column.', { key: nameKey }));
  else if (nameKey) why.push(i18n('Names (from “{key}”) are off because there are so many.', { key: nameKey }));
  return { counts: n, pts, bounds: L.latLngBounds([bb[1], bb[0]], [bb[3], bb[2]]), keys: strKeys.concat([...keys].filter(([, e]) => !e.str).map(([k]) => k)), cfg, why };
}

/* ---------- 3. draw it in the coloring-page style ---------- */
function ptHtml(c, i, big) {
  if (c.pt === 'num') return `<div class="dnum">${esc(i)}</div>`;
  if (c.pt === 'star') { const s = big ? 24 : 16; return `<svg class="dmk" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="${STAR_D}" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`; }
  if (c.pt === 'pin') return `<svg class="dmk pin" width="20" height="28" viewBox="0 0 24 30"><path d="${PIN_D}" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="10" r="3.6" fill="#fff" stroke="${INK}" stroke-width="2"/></svg>`;
  const r = big ? 6 : 3.5; return `<svg class="dmk" width="${r * 2 + 4}" height="${r * 2 + 4}"><circle cx="${r + 2}" cy="${r + 2}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="${big ? 2 : 1.6}"/></svg>`;
}
function ringCenter(ring) { /* area-weighted centroid of a ring, in lng/lat */
  let a = 0, x = 0, y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f; }
  return a ? [x / (3 * a), y / (3 * a), Math.abs(a)] : [ring[0][0], ring[0][1], 0];
}
/* one label: the picked columns side by side ("Joplin · EF5") or stacked, in the picked look and size */
const lblHtml = (c, parts, cls, attrs = '') => `<div class="dl ${cls} s-${c.lstyle || 'plain'} z-${c.lsize || 'm'}${c.ljoin === 'stack' && parts.length > 1 ? ' stack' : ''}"${attrs}>` +
  (c.ljoin === 'stack' ? parts.map((t) => `<span class="nm">${esc(t)}</span>`).join('') : `<span class="nm">${esc(parts.join(' · '))}</span>`) + '</div>';
const lbl = (latlng, html) => L.marker(latlng, { icon: L.divIcon({ className: 'lbl-wrap', html, iconSize: [0, 0] }), interactive: false, keyboard: false });
function render(set) {
  if (set.layer) set.layer.remove();
  const c = set.cfg, g = L.layerGroup(), big = set.info.pts <= 40;
  const shapes = set.features.filter((f) => famOf(f.geometry) && famOf(f.geometry) !== 'point');
  const dash = c.line === 'dash' ? `${c.lw * 3.5} ${c.lw * 2.8}` : c.line === 'dot' ? `0.1 ${c.lw * 2.4}` : null;
  if (shapes.length) g.addLayer(L.geoJSON({ type: 'FeatureCollection', features: shapes }, {
    interactive: false,
    style: (f) => famOf(f.geometry) === 'poly'
      ? { color: INK, weight: c.pw, fill: false, lineJoin: 'round', lineCap: 'round' }
      : { color: INK, weight: c.lw, fill: false, lineJoin: 'round', lineCap: 'round', dashArray: dash }
  }));
  const partsOf = (f) => (c.labels && f.properties ? (c.labelKeys || []).map((k) => f.properties[k]).filter((v) => v != null && v !== '').map(String) : []);
  /* a number badge grows with its text ("EF5", "120"): push the label past it */
  const wide = (num) => { const n = String(num).length; return c.pt === 'num' && n > 2 ? ` style="margin-left:${Math.round((n - 2) * 3.6)}px"` : ''; };
  let i = 0;
  for (const f of set.features) {
    const k = famOf(f.geometry); if (!k) continue;
    const t = partsOf(f).length ? partsOf(f) : null;
    if (k === 'point') {
      const list = f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const p of list) {
        i++;
        const num = c.orderKey && f.properties && f.properties[c.orderKey] != null ? f.properties[c.orderKey] : i;
        g.addLayer(L.marker([p[1], p[0]], { icon: L.divIcon({ className: 'lbl-wrap', html: ptHtml(c, num, big) + (t ? lblHtml(c, t, '', c.pt === 'pin' ? ' style="margin-top:-14px"' : wide(num)) : ''), iconSize: [0, 0] }), interactive: false, keyboard: false }));
      }
    } else if (t && k === 'poly') {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const best = polys.map((p) => ringCenter(p[0])).sort((a, b) => b[2] - a[2])[0];
      g.addLayer(lbl([best[1], best[0]], lblHtml(c, t, 'c big')));
    } else if (t && k === 'line') {
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      const longest = lines.sort((a, b) => b.length - a.length)[0], m = longest[Math.floor(longest.length / 2)];
      g.addLayer(lbl([m[1], m[0]], lblHtml(c, t, 'c')));
    }
  }
  set.layer = g;
  if (set.on) g.addTo(map);
}

/* a tiny picture of the data itself, used as the tile icon */
function iconSvg(features, info) {
  const b = info.bounds, midLat = (b.getNorth() + b.getSouth()) / 2, kx = Math.cos(midLat * Math.PI / 180);
  const w = Math.max((b.getEast() - b.getWest()) * kx, 1e-6), h = Math.max(b.getNorth() - b.getSouth(), 1e-6);
  const s = 38 / Math.max(w, h), ox = 24 - (w * s) / 2, oy = 24 - (h * s) / 2;
  const P = (p) => `${(ox + (p[0] - b.getWest()) * kx * s).toFixed(1)} ${(oy + (b.getNorth() - p[1]) * s).toFixed(1)}`;
  const thin = (ring, max) => { const st = Math.max(1, Math.ceil(ring.length / max)); return ring.filter((_, i) => i % st === 0 || i === ring.length - 1); };
  let polys = '', lines = '', dots = '', nd = 0;
  for (const f of features) {
    const g = f.geometry, k = famOf(g); if (!k) continue;
    if (k === 'poly') for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) { const r = thin(poly[0], 80); if (r.length > 3) polys += 'M' + r.map(P).join('L') + 'Z'; }
    if (k === 'line') for (const ln of g.type === 'LineString' ? [g.coordinates] : g.coordinates) lines += 'M' + thin(ln, 80).map(P).join('L');
    if (k === 'point') for (const p of g.type === 'Point' ? [g.coordinates] : g.coordinates) if (nd++ < 80) dots += `<circle cx="${P(p).split(' ')[0]}" cy="${P(p).split(' ')[1]}" r="${info.pts > 40 ? 1.6 : 2.6}"/>`;
  }
  return `<svg class="ic" viewBox="0 0 48 48" aria-hidden="true"><g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">` +
    (polys ? `<path d="${polys}" fill="#fff" stroke-width="1.8"/>` : '') + (lines ? `<path d="${lines}" fill="none" stroke-width="2.6"/>` : '') +
    (dots ? `<g fill="#fff" stroke-width="1.5">${dots}</g>` : '') + '</g></svg>';
}

/* ---------- 4. datasets list, tiles on the "My data" page, saved in IndexedDB ---------- */
const sets = [];
const db = new Promise((res) => {
  try {
    const rq = indexedDB.open('coloring-map', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('datasets', { keyPath: 'key' });
    rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null);
  } catch (e) { res(null); }
});
const store = async (mode, fn) => { const d = await db; if (!d) return null; try { const tx = d.transaction('datasets', mode); const r = fn(tx.objectStore('datasets')); return await new Promise((ok) => { tx.oncomplete = () => ok(r && r.result); tx.onerror = tx.onabort = () => ok(null); }); } catch (e) { return null; } };
const save = (set) => store('readwrite', (os) => os.put({ key: set.key, text: set.text, fname: set.fname, cfg: set.cfg, on: set.on }));
const forget = (set) => store('readwrite', (os) => os.delete(set.key));
let uid = 0;
const page = document.getElementById('myData');
function drawTiles(fresh) {
  page.querySelectorAll('.tw').forEach((n) => n.remove());
  page.querySelector('.my-empty').style.display = sets.length ? 'none' : '';
  for (const set of sets) {
    const w = document.createElement('div'); w.className = 'tw'; w.style.position = 'relative';
    w.innerHTML = `<button class="tile${set === fresh ? ' new' : ''}" style="width:100%" aria-pressed="${set.on}">${iconSvg(set.features, set.info)}<span class="tn">${esc(set.cfg.name)}</span>${set.on ? CK : ''}</button><button class="gear" aria-label="${i18n('Change {name}', { name: esc(set.cfg.name) })}">${GEAR}</button>`;
    w.firstChild.addEventListener('click', () => { set.on = !set.on; set.on ? set.layer.addTo(map) : set.layer.remove(); drawTiles(); save(set); });
    w.lastChild.addEventListener('click', (e) => { e.stopPropagation(); openSheet(set, false); });
    page.appendChild(w);
  }
}

/* ---------- 5. the "add to map" sheet: shows what we found and lets you change our guesses ---------- */
const stage = document.getElementById('stage');
stage.insertAdjacentHTML('beforeend', `<div class="drop" id="dropZone" aria-hidden="true"><div class="drop-in">
  <svg width="64" height="64" viewBox="0 0 48 48"><g fill="none" stroke="#1E1B18" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6h17l9 9v27H12z" fill="#FFC93C"/><path d="M29 6v9h9"/><path d="M25 21v14M19 29l6 6 6-6" stroke-width="3"/></g></svg>
  <b>${i18n('Drop it on the map!')}</b><span>${i18n("We'll draw your places, lines and areas in coloring-page style.")}</span></div></div>
<div class="ds" id="dsSheet" role="dialog" aria-label="${i18n('Your data')}"></div>`);
const sheet = document.getElementById('dsSheet');
const seg = (name, val, opts) => `<div class="seg" role="group" data-k="${name}">${opts.map(([v, label, ic]) => `<button type="button" data-v="${v}" aria-pressed="${v === val}">${ic || ''}${label}</button>`).join('')}</div>`;
const IC = {
  star: `<svg viewBox="0 0 24 24"><path d="${STAR_D}" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  dot: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5.5" fill="#fff" stroke="${INK}" stroke-width="2.4"/></svg>`,
  pin: `<svg viewBox="0 0 24 30"><path d="${PIN_D}" fill="#fff" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="12" cy="10" r="3.4" fill="#fff" stroke="${INK}" stroke-width="2.2"/></svg>`,
  num: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#fff" stroke="${INK}" stroke-width="2.2"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" font-family="Baloo 2, sans-serif" fill="${INK}">1</text></svg>`,
  solid: `<svg viewBox="0 0 24 24"><path d="M3 12h18" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></svg>`,
  dash: `<svg viewBox="0 0 24 24"><path d="M3 12h18" stroke="${INK}" stroke-width="3" stroke-dasharray="5 4"/></svg>`,
  dotl: `<svg viewBox="0 0 24 24"><path d="M3 12h18" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.1 5.5"/></svg>`
};
const range = (k, v, min, max) => `<label class="slide" style="padding:0 2px"><span class="sr">${i18n('Thickness')}</span><svg width="22" height="14" aria-hidden="true"><path d="M2 7h18" stroke="${INK}" stroke-width="1"/></svg><input type="range" min="${min}" max="${max}" step="0.25" value="${v}" data-k="${k}"><svg width="22" height="14" aria-hidden="true"><path d="M3 7h16" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></svg></label>`;
/* which columns go on each label (in the order you tap them), and how the label looks */
const AA = (cls, t) => `<span class="aa ${cls}" aria-hidden="true">${t}</span>`;
const lblSec = (set) => {
  const c = set.cfg, on = c.labelKeys || [];
  return `<div class="ds-lbl"${c.labels ? '' : ' style="display:none"'}>
    <span class="lab">${i18n('Words from')}</span>
    <div class="chips" role="group" aria-label="${i18n('Names come from')}">${set.info.keys.map((k) => { const i = on.indexOf(k); return `<button type="button" data-key="${esc(k)}" aria-pressed="${i >= 0}">${i >= 0 && on.length > 1 ? `<b>${i + 1}</b>` : ''}${esc(k)}</button>`; }).join('')}</div>
    ${on.length > 1 ? seg('ljoin', c.ljoin, [['line', i18n('Side by side')], ['stack', i18n('Stacked')]]) : ''}
    <span class="lab">${i18n('Letters')}</span>
    ${seg('lstyle', c.lstyle, [['plain', i18n('Plain'), AA('', 'Aa')], ['bubble', i18n('Bubble'), AA('bubble', 'Aa')], ['caps', i18n('Caps'), AA('caps', 'AA')], ['tag', i18n('Tag'), AA('tag', 'Aa')]])}
    ${seg('lsize', c.lsize, [['s', i18n('Small'), AA('', '<small>A</small>')], ['m', i18n('Medium'), AA('', 'A')], ['l', i18n('Large'), AA('', '<big>A</big>')]])}
  </div>`;
};
/* with Numbers, the number can come from any column (a rating, a day...) instead of the order in the file */
const numSel = (set) => `<select class="field ds-num" data-k="orderKey" aria-label="${i18n('Numbers come from')}"${set.cfg.pt === 'num' ? '' : ' style="display:none"'}>
  <option value="">${i18n('1, 2, 3… in order')}</option>${set.info.keys.map((k) => `<option value="${esc(k)}" ${k === set.cfg.orderKey ? 'selected' : ''}>${i18n('from “{key}”', { key: esc(k) })}</option>`).join('')}</select>`;
let current = null, isNew = false;
function openSheet(set, fresh) {
  current = set; isNew = fresh;
  const c = set.cfg, n = set.info.counts, P = (k, one, many) => (n[k] ? `<span class="chip">${KIND_IC[k]}${k === 'point' ? set.info.pts : n[k]} ${i18n((k === 'point' ? set.info.pts : n[k]) === 1 ? one : many)}</span>` : '');
  sheet.innerHTML = `
    <div class="ds-head">${iconSvg(set.features, set.info)}<input class="field" data-k="name" value="${esc(c.name)}" aria-label="${i18n('Name')}"></div>
    <div class="ds-found">${P('point', 'place', 'places')}${P('line', 'line', 'lines')}${P('poly', 'area', 'areas')}</div>
    <p class="ds-why">${fresh ? set.info.why.map(esc).join(' ') : i18n('Change how it looks on the page.')}</p>
    ${n.point ? `<div class="ds-sec"><span class="lab">${i18n('Places look like')}</span>${seg('pt', c.pt, [['star', i18n('Stars'), IC.star], ['dot', i18n('Dots'), IC.dot], ['pin', i18n('Pins'), IC.pin], ['num', i18n('Numbers'), IC.num]])}${numSel(set)}</div>` : ''}
    ${n.line ? `<div class="ds-sec"><span class="lab">${i18n('Lines')}</span>${seg('line', c.line, [['solid', i18n('Solid'), IC.solid], ['dash', i18n('Dashed'), IC.dash], ['dot', i18n('Dotted'), IC.dotl]])}${range('lw', c.lw, 1, 8)}</div>` : ''}
    ${n.poly ? `<div class="ds-sec"><span class="lab">${i18n('Outline')}</span>${range('pw', c.pw, 0.75, 6)}</div>` : ''}
    ${set.info.keys.length ? `<div class="ds-sec"><button type="button" class="toggle" data-k="labels" aria-pressed="${c.labels}">${i18n('Write names')} <span class="sw"><i></i></span></button>${lblSec(set)}</div>` : ''}
    <div class="ds-acts">${fresh ? `<button type="button" class="btn" data-act="cancel">${i18n('Cancel')}</button><button type="button" class="btn go" data-act="add">${i18n('Add to map')}</button>`
      : `<button type="button" class="btn del" data-act="remove" aria-label="${i18n('Remove')}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button><button type="button" class="btn" data-act="zoom">${i18n('Zoom to it')}</button><button type="button" class="btn go" data-act="done">${i18n('Done')}</button>`}</div>`;
  sheet.classList.add('on');
  if (matchMedia('(max-width:1099px)').matches) patch({ panel: '' });
}
function showError(msg, fname) {
  current = null;
  sheet.innerHTML = `<div class="ds-head"><span style="font-size:22px;font-weight:800">${i18n("Hmm, that didn't work")}</span></div><div class="ds-err">${esc(msg)}</div><p class="ds-why">${esc(fname)}</p><div class="ds-acts"><button type="button" class="btn go" data-act="close">${i18n('OK')}</button></div>`;
  sheet.classList.add('on');
}
const closeSheet = () => { sheet.classList.remove('on'); current = null; };
sheet.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const act = b.dataset.act, set = current;
  if (act === 'close') return closeSheet();
  if (!set) return;
  if (b.parentElement.classList.contains('seg')) {
    set.cfg[b.parentElement.dataset.k] = b.dataset.v; b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    const ns = sheet.querySelector('.ds-num'); if (ns) ns.style.display = set.cfg.pt === 'num' ? '' : 'none';
    render(set);
  }
  else if (b.dataset.key != null) {
    const ks = set.cfg.labelKeys = (set.cfg.labelKeys || []).slice(), i = ks.indexOf(b.dataset.key);
    i >= 0 ? ks.splice(i, 1) : ks.push(b.dataset.key);
    const sc = sheet.querySelector('.chips').scrollTop;
    sheet.querySelector('.ds-lbl').outerHTML = lblSec(set); sheet.querySelector('.chips').scrollTop = sc;
    render(set);
  }
  else if (b.dataset.k === 'labels') { set.cfg.labels = !set.cfg.labels; b.setAttribute('aria-pressed', set.cfg.labels); sheet.querySelector('.ds-lbl').style.display = set.cfg.labels ? '' : 'none'; render(set); }
  else if (act === 'cancel' || act === 'remove') { set.layer.remove(); sets.splice(sets.indexOf(set), 1); drawTiles(); closeSheet(); forget(set); }
  else if (act === 'add') { closeSheet(); drawTiles(set); save(set); patch({ featPage: 2, featView: '' }); }
  else if (act === 'done') { closeSheet(); drawTiles(); save(set); }
  else if (act === 'zoom') { app.userMoved = true; app.fitTo(set.info.bounds); }
});
sheet.addEventListener('input', (e) => {
  const set = current, k = e.target.dataset.k; if (!set || !k) return;
  if (k === 'name') { set.cfg.name = e.target.value; return; }
  set.cfg[k] = e.target.type === 'range' ? +e.target.value : e.target.value;
  render(set);
});
sheet.addEventListener('change', (e) => { if (current && e.target.dataset.k === 'orderKey') { current.cfg.orderKey = e.target.value; render(current); } });

/* ---------- 6. getting a file in: drop anywhere, pick a file, or try a sample ---------- */
/* datasets saved before labels could take several columns kept one "labelKey" */
const upgrade = (cfg, old) => { if (!old.labelKeys) cfg.labelKeys = old.labelKey ? [old.labelKey] : cfg.labelKeys; delete cfg.labelKey; return cfg; };
async function addText(text, fname, saved) {
  let r, info;
  try { r = readFile(text, fname); info = analyze(r.features, fname, r.title); }
  catch (e) { if (!saved) showError(e.message, fname); return; }
  const set = { id: ++uid, key: saved ? saved.key : Date.now() + '-' + uid, text, fname, features: r.features, info, cfg: saved ? upgrade({ ...info.cfg, ...saved.cfg }, saved.cfg) : info.cfg, on: saved ? saved.on : true, layer: null };
  sets.push(set);
  render(set);
  if (saved) return;
  app.userMoved = true; app.fitTo(info.bounds);
  openSheet(set, true);
}
const addFiles = async (files) => { for (const f of files) await addText(await f.text(), f.name); };
const drop = document.getElementById('dropZone');
let depth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('on'); });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; drop.classList.remove('on'); } });
window.addEventListener('drop', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; drop.classList.remove('on'); addFiles([...e.dataTransfer.files]); });
const picker = document.getElementById('dsFile');
picker.addEventListener('change', () => { addFiles([...picker.files]); picker.value = ''; });
document.getElementById('dsPick').addEventListener('click', () => picker.click());

const SAMPLES = [['national-parks.geojson', 'National parks'], ['route-66.geojson', 'Route 66'], ['us-regions.geojson', 'US regions'], ['road-trip.geojson', 'Road trip'], ['state-capitals.csv', 'State capitals (CSV)'], ['world-capitals.geojson', 'World capitals']].map(([f, l]) => [f, i18n(l)]);
const sampleBox = document.getElementById('dsSamples');
let samplesLoaded = false;
const loadSamples = () => { if (samplesLoaded) return; samplesLoaded = true; for (const [file, label] of SAMPLES) {
  const b = document.createElement('button'); b.className = 'tile'; b.type = 'button';
  b.innerHTML = `<svg class="ic" viewBox="0 0 48 48"></svg><span class="tn">${esc(label)}</span>`;
  sampleBox.appendChild(b);
  fetch('/samples/' + file).then((r) => r.text()).then((text) => {
    b._text = text;
    try { const r = readFile(text, file), info = analyze(r.features, file, r.title); b.querySelector('.ic').outerHTML = iconSvg(r.features, info); } catch (e) { /* icon stays blank */ }
  });
  b.addEventListener('click', async () => addText(b._text || await (await fetch('/samples/' + file)).text(), file));
} };
/* samples are only fetched once someone opens Add data */
document.querySelector('.tile.add').addEventListener('pointerdown', loadSamples, { once: true });
document.querySelector('.tile.add').addEventListener('click', loadSamples, { once: true });

/* bring back what was added last time */
const kept = (await store('readonly', (os) => os.getAll())) || [];
kept.sort((a, b) => (a.key < b.key ? -1 : 1));
for (const k of kept) await addText(k.text, k.fname, k);
drawTiles();
