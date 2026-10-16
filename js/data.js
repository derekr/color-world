/* Fetch the map data (preloaded by index.html) and build the layers, labels and capitals. */
import { CONT_LABELS, INK, NA, OCEAN_LABELS, STAR, STATE_Z } from './constants.js';
import { clean, fixFeatures } from './geo.js';
import { esc } from './dom.js';
import { map } from './map.js';
import { app } from './app.js';

export const loadData = async () => {
  try {
    const [states, labels, caps, torn, world, wlabels, wcaps, prov, cont] = await Promise.all(
      ['states-10m', 'labels', 'capitals', 'tornadoes', 'world-50m', 'world-labels', 'world-capitals', 'world-provinces-50m', 'continents'].map((n) => fetch(`data/${n}.json`).then((r) => r.json())));
    // Keep the 50 states + DC; drop territories (PR, GU, VI, AS, MP: FIPS >= 60).
    states.objects.states.geometries = states.objects.states.geometries.filter((g) => +g.id < 60);
    states.objects.nation = states.objects.states;
    const feats = fixFeatures(topojson.feature(states, states.objects.states));
    app.data.features = feats.features;
    app.data.labels = labels.labels.map((l) => ({ ...l, tornadoes: l.tornadoes != null ? l.tornadoes : (torn.values[l.name] ?? null) }));

    // world: every country is tagged with a continent (data/continents.json); all continents start switched on
    const wc = world.objects.countries;
    const contOf = (o) => (o.id ? cont.ids[o.id] : cont.names[o.properties.name]) || null;
    const gcont = new Map(wc.geometries.map((g) => [g, contOf(g)]));
    prov.letters = cont.provinces;
    app.topo = { world, wc, gcont, prov };
    const wfeats = fixFeatures(topojson.feature(world, wc));
    const NAME_FIX = { 'N. Cyprus': 'Turkish Republic of Northern Cyprus' };
    const byIso = {}, byName = {};
    wfeats.features.forEach((f) => { if (f.id) byIso[f.id] = f; else byName[NAME_FIX[f.properties.name] || f.properties.name] = f; });
    for (const l of wlabels.labels) {
      if (l.iso === '010' || l.a3 === 'ATA') continue;
      const lc = (l.iso && cont.ids[l.iso]) || cont.names[l.name] || null;
      const f = (l.iso && byIso[l.iso]) || byName[l.name] || null;
      let display = l.name;
      if (/^People's Republic of China/.test(display)) display = 'China';
      if (display === 'United States of America') display = 'United States';
      app.places.push({ key: 'c:' + (l.iso || l.a3 || l.name), display, short: l.short && l.short !== display ? l.short : null, minLabel: l.minLabel, rank: l.rank, a3: l.a3, lat: l.lat, lng: l.lng, feature: f, fname: f ? f.properties.name : null, cont: f ? contOf(f) || lc : lc });
    }
    const list = document.getElementById('places');
    const seen = new Set();
    ['World', 'United States', ...app.places.filter((p) => p.a3 !== 'USA').map((p) => p.display).sort(), ...feats.features.map((f) => f.properties.name)]
      .forEach((n) => { if (seen.has(n)) return; seen.add(n); const o = document.createElement('option'); o.value = n; list.appendChild(o); });

    const base = { color: INK, lineJoin: 'round', lineCap: 'round', fill: false, interactive: false };
    const fillStyle = { stroke: false, fill: true, fillColor: '#FFC93C', fillOpacity: 0 };
    const placeOf = new Map(app.places.filter((p) => p.feature).map((p) => [p.feature, p]));
    app.layers.countries = L.geoJSON({ type: 'FeatureCollection', features: wfeats.features.filter((f) => f.id !== '840') }, {
      style: fillStyle,
      onEachFeature: (f, lyr) => {
        app.fills.push({ lyr, cont: contOf(f) });
        const p = placeOf.get(f); if (!p) return;
        app.placeLayers[p.key] = lyr;
        lyr.on('click', (e) => { if (app.s && app.s.tool === 'move') app.selectPlace(p.key, p.display, e.containerPoint); });
      }
    }).addTo(map);
    app.layers.states = L.geoJSON(feats, {
      style: fillStyle,
      onEachFeature: (f, lyr) => {
        app.placeLayers[f.properties.name] = lyr;
        lyr.on('click', (e) => { if (app.s && app.s.tool === 'move') app.selectPlace(f.properties.name, f.properties.name, e.containerPoint); });
      }
    }).addTo(map);
    const mk = (w, mesh) => L.geoJSON(mesh ? clean(mesh) : null, { style: { ...base, weight: w }, interactive: false }).addTo(map);
    app.layers.borders = mk(1.25);
    app.layers.coast = mk(2);
    app.layers.provinces = mk(1.25);
    app.layers.stateMesh = mk(1.25, topojson.mesh(states, states.objects.states, (a, b) => a !== b));
    app.layers.nation = mk(2, topojson.mesh(states, states.objects.nation, (a, b) => a === b));
    /* lat/long grid every 30 degrees, and the equator + tropics: thin dashed lines */
    const dash = { color: INK, interactive: false, lineJoin: 'round' };
    const grid = [];
    for (let la = -60; la <= 60; la += 30) grid.push([[la, -200], [la, 200]]);
    for (let lo = -180; lo <= 180; lo += 30) grid.push([[-85, lo], [85, lo]]);
    app.layers.grid = L.polyline(grid, { ...dash, weight: 0.9, dashArray: '2 6', opacity: 0.8 });
    app.layers.equator = L.polyline([[[0, -200], [0, 200]], [[23.4365, -200], [23.4365, 200]], [[-23.4365, -200], [-23.4365, 200]]], { ...dash, weight: 1.75, dashArray: '9 7' });

    const mkLbl = (lat, lng) => L.marker([lat, lng], { icon: L.divIcon({ className: 'lbl-wrap', html: '', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(map);
    for (const l of app.data.labels) app.labelMarkers[l.name] = mkLbl(l.lat, l.lng);
    const fixed = (cls, text) => L.divIcon({ className: 'lbl-wrap', html: `<div class="lbl"><span class="${cls}">${esc(text)}</span></div>`, iconSize: [0, 0] });
    const mkFixed = (cls, text, lat, lng) => L.marker([lat, lng], { icon: fixed(cls, text), interactive: false, keyboard: false, zIndexOffset: -50 });
    for (const [text, lat, lng] of CONT_LABELS) app.contMarkers.push({ cont: text, text, lat, lng, m: mkFixed('cn', text, lat, lng) });
    for (const [text, lat, lng] of OCEAN_LABELS) app.oceanMarkers.push({ text, lat, lng, m: mkFixed('on-lbl', text, lat, lng) });
    for (const p of app.places) p.marker = mkLbl(p.lat, p.lng);
    const contByA3 = Object.fromEntries(app.places.filter((p) => p.a3).map((p) => [p.a3, p.cont]));
    const contByName = Object.fromEntries(app.places.map((p) => [p.display, p.cont]));
    const star = (c, minZoom) => app.capMarkers.push({ minZoom, m: L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'lbl-wrap', html: STAR, iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: -100 }) });
    for (const c of caps) star(c, STATE_Z);
    for (const c of wcaps) star(c, c.minZoom);
    for (const c of app.capMarkers) c.cont = NA;
    wcaps.forEach((c, i) => { app.capMarkers[caps.length + i].cont = contByA3[c.a3] || contByName[c.country] || null; });
    app.capMarkers.forEach((c) => { if (!c.cont) console.warn('capital without continent', c); });
    app.applyConts();
    if (app.s) app.sync(app.s);
  } catch (e) { console.error('data load failed', e); }
};
