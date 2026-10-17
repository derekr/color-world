/* ---------- Coloring Map app: the map component, the app object driven by Datastar signals, UI wiring and data load.
   Loaded as a module (modulepreloaded by index.html); datasets.js picks up window.app once this has built it. ---------- */
import { mergePatch, root, rocket } from './vendor/datastar-rocket.js';

/* Deploys stamp each asset URL with ?v=<content hash> so it can be cached for a year (scripts/stamp.mjs). Literal paths
   are rewritten in place; a path built at runtime has to go through asset(), which reads the manifest the stamp writes
   into index.html (locally there is none, so it returns the plain path). */
const asset = (p) => { const v = window.ASSET_V && window.ASSET_V[p.replace(/^\//, '')]; return v ? `${p}?v=${v}` : p; };
/* UI text drawn from JS goes through i18n(): a translated page (scripts/locales.mjs) injects window.I18N, English → its
   language, with {name} slots filled from vars. Place names come from window.PLACE_NAMES, keyed by place key (c:<iso>) or
   English state name; English names stay the keys everywhere else. */
const i18n = (s, vars) => ((window.I18N && window.I18N[s]) || s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m));
const nameOf = (key, en) => (window.PLACE_NAMES && window.PLACE_NAMES[key]) || en;

const INK = '#1E1B18';
const US_BOUNDS = L.latLngBounds([24.3, -125.2], [49.6, -66.6]);
const MAX_BOUNDS = [[-86, -200], [85, 200]];
const WORLD_BOUNDS = L.latLngBounds([-56, -190], [78, 192]);
const FULL_BOUNDS = L.latLngBounds([-84, -190], [83, 192]);
/* Keep Russia and Alaska whole across the 180° line: Chukotka moves east of 180, the western Aleutians west of -180. */
const fixPt = (p) => (p[0] < -169 && p[1] > 64.5) ? [p[0] + 360, p[1]] : (p[0] > 170 && p[1] > 50 && p[1] < 56) ? [p[0] - 360, p[1]] : p;
const fixCoords = (c) => typeof c[0] === 'number' ? fixPt(c) : c.map(fixCoords);
const fixFeatures = (fc) => { for (const f of fc.features) if (f.geometry) f.geometry.coordinates = fixCoords(f.geometry.coordinates); return fc; };
/* split lines where they jump across the antimeridian, and drop edges that run along it */
const clean = (g) => {
  const out = [];
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  for (const ln of lines) {
    let cur = [];
    for (const raw of ln) {
      const pt = fixPt(raw), last = cur[cur.length - 1];
      if (last && (Math.abs(pt[0] - last[0]) > 180 || (Math.abs(Math.abs(pt[0]) - 180) < 0.01 && Math.abs(Math.abs(last[0]) - 180) < 0.01) || (pt[1] < -89.9 && last[1] < -89.9))) { if (cur.length > 1) out.push(cur); cur = []; }
      cur.push(pt);
    }
    if (cur.length > 1) out.push(cur);
  }
  return { type: 'MultiLineString', coordinates: out };
};
/* Map shapes beyond Leaflet's Web Mercator. Leaflet has no curved CRS of its own, but a CRS is just project/unproject, so these are
   written out here, in the same units and pixel scale as Web Mercator so zoom levels feel alike. */
const R_EARTH = 6378137;
const mkCRS = (code, projection) => { const sc = 0.5 / (Math.PI * R_EARTH); return L.extend({}, L.CRS.Earth, { code, projection, transformation: new L.Transformation(sc, 0.5, -sc, 0.5) }); };
/* Equal Earth (Šavrič, Patterson, Jenny 2018), "Round": equal-area, curved sides, flat poles. The inverse solves for the parametric
   latitude with a few Newton steps. */
const EE = (() => {
  const R = R_EARTH, A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2, D = Math.PI / 180;
  const yOf = (t) => { const l2 = t * t, l6 = l2 * l2 * l2; return t * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)); };
  const dOf = (t) => { const l2 = t * t, l6 = l2 * l2 * l2; return A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2); };
  const TMAX = Math.asin(M), YMAX = yOf(TMAX);
  const projection = {
    project(ll) {
      const t = Math.asin(M * Math.sin(Math.max(-90, Math.min(90, ll.lat)) * D));
      return L.point(R * ll.lng * D * Math.cos(t) / (M * dOf(t)), R * yOf(t));
    },
    unproject(p) {
      const y = p.y / R;
      let t = Math.max(-TMAX, Math.min(TMAX, y));
      if (Math.abs(y) >= YMAX) t = Math.sign(y) * TMAX;
      else for (let i = 0; i < 12; i++) { const d = (yOf(t) - y) / dOf(t); t -= d; if (Math.abs(d) < 1e-12) break; }
      return L.latLng(Math.asin(Math.sin(t) / M) / D, p.x / R * M * dOf(t) / Math.cos(t) / D);
    },
    bounds: L.bounds([-2.7064 * R, -YMAX * R], [2.7064 * R, YMAX * R])
  };
  return mkCRS('EqualEarth', projection);
})();
/* Winkel Tripel, "Globe": curved poles, the National Geographic world map. It has no closed-form inverse, so unproject runs a damped
   2D Newton solve from a linear first guess. */
const WT = (() => {
  const R = R_EARTH, D = Math.PI / 180, C1 = 2 / Math.PI;
  const fwd = (lng, lat) => {
    const l = lng * D, f = Math.max(-90, Math.min(90, lat)) * D, a = Math.acos(Math.cos(f) * Math.cos(l / 2)), si = a ? Math.sin(a) / a : 1;
    return [0.5 * (l * C1 + 2 * Math.cos(f) * Math.sin(l / 2) / si), 0.5 * (f + Math.sin(f) / si)];
  };
  const projection = {
    project(ll) { const [x, y] = fwd(ll.lng, ll.lat); return L.point(R * x, R * y); },
    unproject(p) {
      const x = p.x / R, y = p.y / R, h = 1e-6;
      let lng = x / ((1 + C1) / 2) / D, lat = Math.max(-90, Math.min(90, y / D));
      for (let i = 0; i < 25; i++) {
        const [fx, fy] = fwd(lng, lat), ex = fx - x, ey = fy - y;
        if (Math.abs(ex) + Math.abs(ey) < 1e-12) break;
        const [ax, ay] = fwd(lng + h, lat), [bx, by] = fwd(lng, lat + h), j11 = (ax - fx) / h, j21 = (ay - fy) / h, j12 = (bx - fx) / h, j22 = (by - fy) / h;
        const det = j11 * j22 - j12 * j21;
        if (!det) break;
        lng = Math.max(-360, Math.min(360, lng - (j22 * ex - j12 * ey) / det));
        lat = Math.max(-90, Math.min(90, lat - (j11 * ey - j21 * ex) / det));
      }
      return L.latLng(lat, lng);
    },
    bounds: L.bounds([-fwd(180, 0)[0] * R, -fwd(0, 90)[1] * R], [fwd(180, 0)[0] * R, fwd(0, 90)[1] * R])
  };
  return mkCRS('WinkelTripel', projection);
})();
const SHAPES = { flat: L.CRS.EPSG3857, round: EE, globe: WT };
const IGNORES_PAGE_SIZE = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium\//.test(navigator.userAgent);
const STATE_Z = 4;
const CONTS = [['Africa', 'cAfrica'], ['Antarctica', 'cAntarctica'], ['Asia', 'cAsia'], ['Europe', 'cEurope'], ['North America', 'cNorthAmerica'], ['Oceania', 'cOceania'], ['South America', 'cSouthAmerica']];
const NA = 'North America';
/* rough extents (lat/lng) per continent, used to fit the view to whatever is switched on */
const CONT_BOUNDS = { Africa: [[-35, -18], [38, 52]], Antarctica: [[-85, -180], [-62, 180]], Asia: [[-11, 26], [56, 146]], Europe: [[35, -25], [78, 192]], 'North America': [[7, -170], [84, -10]], Oceania: [[-48, 110], [0, 192]], 'South America': [[-56, -82], [13, -34]] };
/* fixed spots for the big continent names and the ocean names */
const CONT_LABELS = [['Africa', 5, 21], ['Antarctica', -80, 0], ['Asia', 46, 95], ['Europe', 56, 24], ['North America', 47, -102], ['Oceania', -25, 134], ['South America', -13, -60]];
const OCEAN_LABELS = [['North Pacific', 28, -150], ['South Pacific', -30, -125], ['North Atlantic', 32, -42], ['South Atlantic', -22, -18], ['Indian Ocean', -18, 80], ['Southern Ocean', -62, 40], ['Arctic Ocean', 80, 75]];
const PROV_CONT = { A: 'Asia', E: 'Europe', F: 'Africa', N: NA, O: 'Oceania', S: 'South America', T: 'Antarctica' };
const FIT = {
  'France': [[41.2, -5.5], [51.2, 9.8]], 'Spain': [[35.9, -9.5], [43.9, 4.5]], 'Portugal': [[36.8, -9.6], [42.2, -6.1]],
  'Norway': [[57.9, 4.5], [71.3, 31.5]], 'Netherlands': [[50.7, 3.2], [53.6, 7.3]], 'Denmark': [[54.5, 8], [57.8, 15.2]],
  'Chile': [[-56, -76], [-17.5, -66]], 'Ecuador': [[-5.1, -81.1], [1.5, -75.2]], 'United States of America': [[24.3, -125.2], [49.6, -66.6]]
};
const FIT_OPTS = { 'Russia': { minLng: 0 }, 'Fiji': { minLng: 0 } };
const STAR = '<svg class="cap" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.8 5.8 6.4.9-4.6 4.4 1.1 6.3L12 16.9l-5.7 3 1.1-6.3-4.6-4.4 6.4-.9z" fill="#ffffff" stroke="#1E1B18" stroke-width="2.2" stroke-linejoin="round"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const patch = (o) => mergePatch(o);
/* keep in sync with the CSS: phone = narrow OR short landscape (<500px tall, <1100 wide) */
const mq = { phone: matchMedia('(max-width:699px), (max-width:1099px) and (max-height:499px)'), tablet: matchMedia('(min-width:700px) and (max-width:1099px) and (min-height:500px)') };

/* The map lifecycle belongs to <color-map>: it creates Leaflet in onFirstRender and removes it on disconnect.
   Layer/style state still flows from the Datastar signals through app.sync(). */
let resolveMap;
const mapReady = new Promise((r) => { resolveMap = r; });
rocket('color-map', {
  mode: 'light',
  props: ({ json }) => ({ center: json.default(() => [20, 0]), zoom: json.default(() => 2) }),
  renderOnPropChange: false,
  render: ({ html }) => html`<div id="map" role="application" aria-label="${i18n('World map')}" data-ref:container></div>`,
  onFirstRender: ({ refs, props, cleanup }) => {
    const m = L.map(refs.container, {
      zoomControl: false, attributionControl: false, zoomSnap: 0, zoomDelta: 0.5,
      wheelPxPerZoomLevel: 120, minZoom: 1, maxZoom: 12, renderer: L.svg({ padding: 0.5 }),
      worldCopyJump: false, doubleClickZoom: false, trackResize: false /* relayout below handles resizes */
    });
    m.setView(props.center, props.zoom);
    cleanup(() => m.remove());
    resolveMap(m);
  }
});
const map = await mapReady;

const app = window.app = {
  map, s: null, data: {}, placeLayers: {}, labelMarkers: {}, capMarkers: [], places: [], words: {}, freeTags: [],
  selected: null, countyLayer: null, countiesLoading: false, frameRect: null, printing: false, saved: null,
  layers: {}, fills: [], vis: new Set(CONTS.map((c) => c[0])), contMarkers: [], oceanMarkers: [],

  /* ---------- layout / frame ---------- */
  effOrient(sz = map.getSize()) {
    const o = this.s ? this.s.orient : 'auto';
    if (o !== 'auto') return o;
    return sz.x > sz.y ? 'landscape' : 'portrait';
  },
  /* The frame's box for a stage of size sz. CSS lays the frame out (see .page-area): the page area is the room around it, and the
     frame is the biggest 8.5 x 11 page that fits in it, centred. This repeats that fit from the area's box rather than reading the
     frame's own, which is mid-transition after an orientation change. */
  frameFor(sz) {
    this.measureBelow();
    const eff = this.effOrient(sz), r = eff === 'landscape' ? 11 / 8.5 : 8.5 / 11;
    const st = document.getElementById('stage').getBoundingClientRect(), a = document.querySelector('.page-area').getBoundingClientRect();
    const aw = Math.max(120, a.width), ah = Math.max(120, a.height), w = Math.min(aw, ah * r), h = w / r;
    return { left: a.left - st.left + (aw - w) / 2, top: a.top - st.top + (ah - h) / 2, width: w, height: h, eff };
  },
  /* Phones: how much of the stage's bottom is taken (--below, see .page-area). An open card sits in the sidebar, outside the stage, so
     it can't be an anchor; without anchor positioning the dock, orientation control and place sheet are measured here too. */
  measureBelow() {
    const st = document.getElementById('stage');
    let below = 0;
    if (mq.phone.matches) {
      const sel = CSS.supports('anchor-name', '--a') ? '.card.open' : '.card.open,#dock,#orientSeg,#placeSheet', sb = st.getBoundingClientRect().bottom;
      for (const el of document.querySelectorAll(sel)) {
        if (el.id === 'orientSeg' && matchMedia('(max-height:499px)').matches) continue; // sits in the top bar when sideways
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) below = Math.max(below, sb - r.top);
      }
    }
    if (st.style.getPropertyValue('--below') !== below + 'px') st.style.setProperty('--below', below + 'px'); /* restyles the whole stage */
  },
  placeFrame(f) {
    const auto = this.s && this.s.orient === 'auto', tag = (auto ? i18n('Auto') : '8.5 × 11') + ' · ' + i18n(f.eff);
    if (root.frameTag !== tag) patch({ frameTag: tag });
  },
  layoutFrame(refit) {
    const sz = map.getSize();
    const { eff, ...rect } = this.frameFor(sz), w = rect.width, h = rect.height;
    this.frameRect = rect;
    this.placeFrame({ ...rect, eff });
    const pad0 = L.point(sz.x - w * 0.94, sz.y - h * 0.94);
    const zmin = Math.max(mq.phone.matches || mq.tablet.matches ? -1 : 0.5, this.boundsZoom(FULL_BOUNDS, pad0) - 0.35);
    this.updateMaxBounds();
    /* a minimum above the current zoom makes Leaflet start an animated zoom up to it, which lands after (and undoes) the refit:
       a window that grows a lot at once (maximized, or a resize that settles) ended up with the map small in a corner */
    if (map.getZoom() < zmin) map.setZoom(zmin, { animate: false });
    map.setMinZoom(zmin);
    if (refit) this.fitTo(this.visBounds(), false); else this.clampToFrame();
  },
  /* what the view should fit: the usual world frame when all the main continents are on, else the union of the visible ones */
  visBounds() {
    const on = CONTS.map((c) => c[0]).filter((n) => this.vis.has(n));
    if (on.length === 7) return FULL_BOUNDS;
    if (on.length === 6 && !this.vis.has('Antarctica')) return WORLD_BOUNDS;
    const b = L.latLngBounds([]);
    for (const n of on) b.extend(CONT_BOUNDS[n]);
    return b.isValid() ? b : WORLD_BOUNDS;
  },
  toggleCont(name) {
    const k = CONTS.find((c) => c[0] === name)[1];
    const n = CONTS.filter((c) => root[c[1]]).length;
    if (root[k] && n <= 1) return; /* at least one continent stays on */
    patch({ [k]: !root[k] });
  },
  /* pixel box of a lat/lng box at zoom z. Sampled along a grid, not just two corners: in Equal Earth the widest point of a box is at
     the latitude nearest the equator, not at a corner. */
  pxBox(b, z) {
    const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast(), out = L.bounds([]);
    const lats = [s, n, 0, ...[1, 2, 3, 4, 5, 6, 7].map((i) => s + (n - s) * i / 8)].filter((la) => la >= s && la <= n);
    for (const la of lats) for (const lo of [w, e]) out.extend(map.project([la, lo], z));
    return out;
  },
  /* like map.getBoundsZoom(b, false, pad), using pxBox */
  boundsZoom(b, pad) {
    const z = map.getZoom(), box = this.pxBox(b, z), sz = map.getSize().subtract(pad), d = box.getSize();
    return Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z + Math.log2(Math.min(sz.x / d.x, sz.y / d.y))));
  },
  /* The frame is off-centre (sidebar, dock, sheets, rail) and hidden continents shift the fit, so the frame (not the screen) is kept inside the world by clampToFrame instead of Leaflet's maxBounds. */
  updateMaxBounds() {
    if (this.printing) return;
    map.setMaxBounds(null);
  },
  clampToFrame() {
    if (this.printing || !this.frameRect || this.sizing) return;
    const [dx, dy] = this.clampDelta(this.frameRect);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) map.panBy([-dx, -dy], { animate: false });
  },
  /* how far the map must move to keep the visible continents and frame f overlapping (smaller land can roam inside the frame, bigger
     land must cover it), with the map first shifted by `by` pixels */
  clampDelta(f, by = [0, 0]) {
    const box = this.pxBox(this.visBounds(), map.getZoom()), off = map.getPixelOrigin().subtract(map._getMapPanePos()).subtract(by);
    const a = box.min.subtract(off), b = box.max.subtract(off);
    const fix = (lo, hi, flo, fhi) => (hi - lo <= fhi - flo) ? (lo < flo ? flo - lo : hi > fhi ? fhi - hi : 0) : lo > flo ? flo - lo : hi < fhi ? fhi - hi : 0;
    return [fix(a.x, b.x, f.left, f.left + f.width), fix(a.y, b.y, f.top, f.top + f.height)];
  },
  fitTo(bounds, animate = true) {
    const f = this.frameRect, sz = map.getSize();
    const pad = L.point(sz.x - f.width * 0.94, sz.y - f.height * 0.94);
    const z = this.boundsZoom(bounds, pad);
    const zz = Math.min(z, 10);
    const { min: pa, max: pb } = this.pxBox(bounds, zz);
    // offset the centre when the frame is off-centre (sidebar, dock/sheets, rail), in one move so animation can't drop it
    const dy = (f.top + f.height / 2) - sz.y / 2, dx = (f.left + f.width / 2) - sz.x / 2;
    map.setView(map.unproject(pa.add(pb).divideBy(2).subtract([dx, dy]), zz), zz, { animate });
  },

  /* ---------- sync from Datastar signals ---------- */
  sync(s) {
    const prev = this.s;
    this.s = s;
    const el = document.getElementById('map');
    el.classList.toggle('hollow', s.hollow);
    el.classList.toggle('tool-text', s.tool === 'text');
    el.classList.toggle('tool-move', s.tool === 'move');
    const L_ = this.layers;
    /* which continents are on */
    const vis = new Set(CONTS.filter((c) => s[c[1]]).map((c) => c[0]));
    const ck = [...vis].join('|');
    const contChanged = ck !== this._ck;
    this._ck = ck; this.vis = vis;
    const na = vis.has(NA);
    const badge = vis.size === 7 ? '7' : vis.size + '/7';
    if (root.contBadge !== badge) patch({ contBadge: badge });
    if (contChanged) { this._cands = null; if (L_.states) this.applyConts(); }
    if (L_.states) {
      s.showCountries ? L_.borders.addTo(map) : L_.borders.remove();
      L_.borders.setStyle({ weight: s.wCountry });
      na && s.showStates ? L_.stateMesh.addTo(map) : L_.stateMesh.remove();
      s.showStates ? L_.provinces.addTo(map) : L_.provinces.remove();
      na ? L_.states.addTo(map) : L_.states.remove();
      na ? L_.nation.addTo(map) : L_.nation.remove();
      for (const k of ['stateMesh', 'provinces']) L_[k].setStyle({ weight: s.wState });
      L_.nation.setStyle({ weight: s.wNation });
      L_.coast.setStyle({ weight: s.wNation });
      s.grid ? L_.grid.addTo(map) : L_.grid.remove();
      s.equator ? L_.equator.addTo(map) : L_.equator.remove();
      s.proj !== 'flat' ? L_.rim.addTo(map) : L_.rim.remove();
      L_.rim.setStyle({ weight: s.wNation });
    }
    if (s.showCounties && na && !this.countyLayer && !this.countiesLoading) this.loadCounties();
    if (this.countyLayer) {
      s.showCounties && na ? this.countyLayer.addTo(map) : this.countyLayer.remove();
      this.countyLayer.setStyle({ weight: s.wCounty });
    }
    if (L_.states) {
      const back = (l) => map.hasLayer(l) && l.bringToBack();
      back(L_.grid); back(L_.equator);
      if (this.countyLayer && s.showCounties) back(this.countyLayer);
      back(L_.states); back(L_.countries);
      for (const k of ['borders', 'provinces', 'stateMesh', 'coast', 'nation']) if (map.hasLayer(L_[k])) L_[k].bringToFront();
    }
    if ((SHAPES[s.proj] || SHAPES.flat) !== map.options.crs) this.setProjection(s.proj);
    if (prev && prev.orient !== s.orient) { /* let the frame slide to the new orientation */
      const st = document.getElementById('stage'); st.classList.add('orienting');
      clearTimeout(this._orientT); this._orientT = setTimeout(() => st.classList.remove('orienting'), 400);
    }
    if (!prev || prev.orient !== s.orient) this.layoutFrame(!this.userMoved);
    else if (contChanged && L_.states && this.frameRect) { this.userMoved = false; this.fitTo(this.visBounds(), false); }
    this.renderLabels();
  },
  /* swap the map shape: every layer re-projects on viewreset, then the view refits */
  setProjection(shape) {
    map.options.crs = SHAPES[shape] || SHAPES.flat;
    map.options.minZoom = -3; /* so layoutFrame's new minimum can't start a zoom animation that lands after the refit */
    map._resetView(map.getCenter(), map.getZoom(), true);
    if (this.layers.grid) this.drawGrid();
    this.userMoved = false;
    if (this.frameRect) { this.fitTo(this.visBounds(), false); this.layoutFrame(true); }
  },
  /* lat/long grid every 30 degrees, and the equator + tropics. Mercator runs them past the map edge; the curved shapes stop them at
     their rim and give them enough points to bend with it. */
  drawGrid() {
    const round = map.options.crs !== L.CRS.EPSG3857, e = round ? 180 : 200, p = round ? 90 : 85;
    const line = (f) => Array.from({ length: 41 }, (_, i) => f(i / 40)), par = (la) => line((t) => [la, -e + 2 * e * t]);
    const grid = [];
    for (let la = -60; la <= 60; la += 30) grid.push(par(la));
    for (let lo = -180; lo <= 180; lo += 30) grid.push(line((t) => [-p + 2 * p * t, lo]));
    this.layers.grid.setLatLngs(grid);
    this.layers.equator.setLatLngs([0, 23.4365, -23.4365].map(par));
  },
  /* show/hide everything that belongs to a continent that was switched off or on */
  applyConts() {
    const L_ = this.layers, vis = this.vis, v = (c) => vis.has(c);
    this.closePop();
    for (const f of this.fills) v(f.cont) ? L_.countries.addLayer(f.lyr) : L_.countries.removeLayer(f.lyr);
    this.drawWorldLines();
    const { prov } = this.topo;
    const pg = prov.objects.provinces.geometries.filter((g, i) => v(PROV_CONT[prov.letters[i]]));
    L_.provinces.clearLayers().addData(clean(topojson.mesh(prov, { type: 'GeometryCollection', geometries: pg })));
  },
  /* country borders and coastline for the visible continents, from whichever world outline is loaded (110m first, then 50m) */
  drawWorldLines() {
    const L_ = this.layers, v = (c) => this.vis.has(c);
    const { world, wc, gcont } = this.topo, vc = (o) => v(gcont.get(o)), notUS = (o) => o.id !== '840';
    L_.borders.clearLayers().addData(clean(topojson.mesh(world, wc, (a, b) => a !== b && notUS(a) && notUS(b) && vc(a) && vc(b))));
    /* coastline: arcs with exactly one included side (the other side is sea or a hidden continent) */
    L_.coast.clearLayers().addData(clean(topojson.mesh(world, wc, (a, b) => notUS(a) && notUS(b) && (a === b ? vc(a) : vc(a) !== vc(b)))));
  },
  async loadCounties() {
    this.countiesLoading = true;
    try {
      const topo = await (await fetch('/data/counties-10m.json')).json();
      topo.objects.counties.geometries = topo.objects.counties.geometries.filter((g) => +String(g.id).padStart(5, '0').slice(0, 2) < 60);
      const mesh = topojson.mesh(topo, topo.objects.counties, (a, b) => a !== b && String(a.id).slice(0, 2) === String(b.id).slice(0, 2));
      this.countyLayer = L.geoJSON(clean(mesh), { style: { color: INK, weight: this.s.wCounty, fill: false, lineJoin: 'round', lineCap: 'round' }, interactive: false, smoothFactor: 1 });
      this.sync(this.s);
    } catch (e) { console.error('counties failed', e); }
    this.countiesLoading = false;
  },

  /* ---------- labels ---------- */
  labelHtml(key, text, tornadoes) {
    const s = this.s;
    let h = '';
    if (text) h += `<span class="nm">${esc(text)}</span>`;
    if (s.tornado && tornadoes != null) h += `<span class="tb">${tornadoes}</span>`;
    const w = this.words[key];
    if (s.mine && w) h += `<span class="mine">${esc(w)}</span>`;
    return h;
  },
  setLbl(m, h) {
    if (m._key === h) return;
    m._key = h;
    m.setIcon(L.divIcon({ className: 'lbl-wrap', html: h ? `<div class="lbl">${h}</div>` : '', iconSize: [0, 0] }));
  },
  renderLabels() {
    const s = this.s; if (!s || !this.data.labels) return;
    const z = map.getZoom();
    const stateZ = z >= STATE_Z;
    const vis = this.vis, na = vis.has(NA);
    for (const l of this.data.labels) {
      const m = this.labelMarkers[l.name]; if (!m) continue;
      this.setLbl(m, na ? this.labelHtml(l.name, s.names && stateZ ? (l.short || l.display) : '', l.tornadoes) : '');
    }
    /* greedy collision pass: state names first, then countries by importance; drop names that would overlap */
    const placed = [];
    const fs = s.hollow ? 15 : 12.5, cw = fs * 0.6 + (s.hollow ? 0.6 : 0.3);
    const box = (pt, text, key) => {
      const w = Math.max(text.length * cw, this.words[key] && s.mine ? this.words[key].length * 7.5 + 16 : 0), h = fs + 3 + (this.words[key] && s.mine ? 20 : 0);
      return { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: pt.y - h / 2, y2: pt.y + h / 2 };
    };
    const hit = (b) => placed.some((p) => b.x1 < p.x2 && b.x2 > p.x1 && b.y1 < p.y2 && b.y2 > p.y1);
    if (s.names && stateZ && na) for (const l of this.data.labels) placed.push(box(map.latLngToContainerPoint([l.lat, l.lng]), l.short || l.display, l.name));
    /* fixed continent / ocean names: shown while zoomed out; country names step aside for them */
    for (const c of this.contMarkers) { const on = s.contNames && vis.has(c.cont) && z <= 5; on ? c.m.addTo(map) : c.m.remove(); if (on) placed.push(box(map.latLngToContainerPoint([c.lat, c.lng]), c.text + '     ', '')); }
    for (const c of this.oceanMarkers) { const on = s.oceanNames && z <= 5; on ? c.m.addTo(map) : c.m.remove(); }
    const shown = this.places.filter((c) => vis.has(c.cont));
    for (const c of this.places) if (!vis.has(c.cont)) this.setLbl(c.marker, '');
    for (const c of shown) c._w = this.words[c.key] && s.mine;
    for (const c of shown.filter((c) => c._w)) placed.push(box(map.latLngToContainerPoint([c.lat, c.lng]), '', c.key));
    const order = [...shown].sort((a, b) => (a.rank - b.rank) || (a.minLabel - b.minLabel));
    for (const c of order) {
      let t = '';
      if (s.names && !(c.a3 === 'USA' && stateZ)) {
        const pt = map.latLngToContainerPoint([c.lat, c.lng]);
        const opts = [];
        if (z >= c.minLabel) opts.push(c.display);
        if (c.short && z >= c.minLabel - 0.8) opts.push(c.short);
        for (const o of opts) { const b = box(pt, o, c.key); if (!hit(b)) { t = o; if (!c._w) placed.push(b); break; } }
      }
      this.setLbl(c.marker, this.labelHtml(c.key, t, null));
    }
    for (const c of this.capMarkers) {
      if (s.capitals && z >= c.minZoom && vis.has(c.cont)) c.m.addTo(map); else c.m.remove();
    }
  },
  setWords(key, v) { this.words[key] = v; this.renderLabels(); },

  /* ---------- state popover ---------- */
  selectPlace(key, name, pt) {
    this.clearSel();
    const lyr = this.placeLayers[key];
    if (lyr) { lyr.setStyle({ fillColor: '#FFC93C', fillOpacity: 0.4 }); this.selected = key; }
    this._selAt = Date.now();
    const stage = document.getElementById('stage').getBoundingClientRect();
    const x = Math.min(Math.max(8, pt.x + 56), stage.width - 262);
    const y = Math.min(Math.max(8, pt.y - 60), stage.height - 170);
    patch({ panel: '', popOpen: true, popName: name, popKey: key, popWords: this.words[key] || '', popX: x, popY: y });
    if (!mq.phone.matches) setTimeout(() => document.getElementById('popWords').focus({ preventScroll: true }), 0);
  },
  clearSel() {
    if (this.selected && this.placeLayers[this.selected]) this.placeLayers[this.selected].setStyle({ fillOpacity: 0 });
    this.selected = null;
  },
  closePop() { this.clearSel(); patch({ popOpen: false }); },

  /* ---------- free text ---------- */
  addTag(latlng, text = i18n('My words')) {
    const wrap = document.createElement('div');
    wrap.className = 'ft';
    wrap.innerHTML = '<span class="ft-grip" role="button" tabindex="0" aria-label="' + i18n('Move text') + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg></span><span class="ft-t" contenteditable="true" role="textbox" aria-label="' + i18n('Text') + '"></span><button class="ft-x" aria-label="' + i18n('Delete text') + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
    const t = wrap.querySelector('.ft-t'); t.textContent = text;
    const icon = L.divIcon({ className: 'ft-wrap', html: wrap, iconSize: [0, 0] });
    const mk = L.marker(latlng, { icon, interactive: true, keyboard: false, bubblingMouseEvents: false }).addTo(map);
    this.freeTags.push(mk);
    L.DomEvent.disableClickPropagation(wrap);
    L.DomEvent.on(wrap, 'pointerdown touchstart wheel', L.DomEvent.stopPropagation);
    wrap.querySelector('.ft-x').addEventListener('click', () => { mk.remove(); this.freeTags = this.freeTags.filter((x) => x !== mk); });
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } });
    const grip = wrap.querySelector('.ft-grip');
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId);
      const move = (ev) => mk.setLatLng(map.mouseEventToLatLng(ev));
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
    });
    return { mk, t };
  },

  /* ---------- search ---------- */
  boundsOf(geom, o = {}) {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const info = [];
    for (const p of polys) {
      const b = L.latLngBounds([]);
      for (const [x, y] of p[0]) {
        if ((o.minLng != null && x < o.minLng) || (o.maxLng != null && x > o.maxLng)) continue;
        b.extend([y, x]);
      }
      if (!b.isValid()) continue;
      info.push({ b, a: (b.getEast() - b.getWest()) * (b.getNorth() - b.getSouth()) });
    }
    const max = Math.max(...info.map((i) => i.a));
    const out = L.latLngBounds([]);
    info.forEach((i) => { if (i.a >= max * 0.03) out.extend(i.b); });
    return out;
  },
  candidates() {
    if (this._cands) return this._cands;
    const c = [{ name: i18n('World'), alt: 'World', b: this.visBounds() }];
    if (this.vis.has(NA)) c.push({ name: nameOf('c:840', 'United States'), alt: 'United States', b: US_BOUNDS });
    const cs = [...this.places].filter((p) => p.a3 !== 'USA' && this.vis.has(p.cont)).sort((a, b) => (a.rank - b.rank) || a.display.localeCompare(b.display));
    for (const p of cs) {
      if (!p.feature) continue;
      const fo = FIT[p.fname];
      c.push({ name: p.display, alt: p.fname, b: fo ? L.latLngBounds(fo) : this.boundsOf(p.feature.geometry, FIT_OPTS[p.fname]) });
    }
    for (const f of this.vis.has(NA) ? this.data.features || [] : []) c.push({ name: nameOf(f.properties.name, f.properties.name), alt: f.properties.name, b: this.boundsOf(f.geometry, f.properties.name === 'Alaska' ? { maxLng: 0 } : {}) });
    return (this._cands = c);
  },
  search(q) {
    q = (q || '').trim().toLocaleLowerCase(); if (!q) return;
    if (q === 'usa' || q === 'us') q = 'united states';
    const c = this.candidates();
    const nm = (x) => [x.name.toLocaleLowerCase(), (x.alt || '').toLowerCase()];
    const hit = c.find((x) => nm(x).includes(q)) || c.find((x) => nm(x).some((n) => n.startsWith(q))) || c.find((x) => nm(x).some((n) => n.includes(q)));
    if (hit && hit.b.isValid()) { this.userMoved = true; this.fitTo(hit.b); }
  },

  /* ---------- print ---------- */
  preparePrint() {
    if (this.printing) return;
    if (this.flushResize) this.flushResize(); /* a resize still settling: finish it, so its scaled preview can't leak into the print */
    this.printing = true;
    const eff = this.effOrient();
    this.saved = { center: map.getCenter(), zoom: map.getZoom(), sel: this.selected, minZoom: map.getMinZoom() };
    map.setMaxBounds(null); map.setMinZoom(-3);
    const f = this.frameRect, fc = map.containerPointToLatLng([f.left + f.width / 2, f.top + f.height / 2]), z0 = map.getZoom();
    this.clearSel();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    let st = document.getElementById('pagecss');
    if (!st) { st = document.createElement('style'); st.id = 'pagecss'; document.head.appendChild(st); }
    /* Safari (and every iOS browser, all WebKit) ignores @page size, so its print dialog always opens in portrait. There a landscape page
       prints on a portrait sheet with the map turned a quarter turn, which comes out of the printer the same. */
    const rot = eff === 'landscape' && IGNORES_PAGE_SIZE;
    document.body.classList.toggle('print-rot', rot);
    document.body.classList.toggle('print-wk', IGNORES_PAGE_SIZE);
    /* no page margin, so the browser has nowhere to print its date / title / URL headers; the 0.4in inset moves into the print CSS.
       WebKit keeps its own margins and headers whatever @page says (they go with the dialog's "Print headers and footers" box), so it
       keeps the layout that fits there. */
    st.textContent = `@page { size: letter ${rot ? 'portrait' : eff}; margin: ${IGNORES_PAGE_SIZE ? '0.4in' : '0'} }`;
    /* turned, the map is 0.1in short of the sheet so rounding can't spill a blank second page */
    const [pw, ph] = eff === 'landscape' ? [rot ? 10.1 : 10.2, 7.7] : [7.7, 10.2];
    document.body.style.setProperty('--pw', pw + 'in');
    document.body.style.setProperty('--ph', ph + 'in');
    document.body.classList.add('printing');
    map.invalidateSize({ animate: false });
    /* fit the frame to the page by centre and scale: a lat/lng box doesn't round-trip through a curved projection */
    const ps = map.getSize();
    map.setView(fc, z0 + Math.log2(Math.min(ps.x / f.width, ps.y / f.height)), { animate: false });
  },
  endPrint() {
    if (!this.printing) return;
    this.printing = false;
    document.body.classList.remove('printing');
    map.setMinZoom(this.saved.minZoom);
    map.invalidateSize({ animate: false });
    map.setView(this.saved.center, this.saved.zoom, { animate: false });
    if (this.saved.sel && this.placeLayers[this.saved.sel]) this.placeLayers[this.saved.sel].setStyle({ fillColor: '#FFC93C', fillOpacity: 0.4 }), this.selected = this.saved.sel;
    this.layoutFrame(false);
  },
  /* Render the map to a canvas (scale ~3) and wrap it in a Letter PDF. Returns { pdf, canvas }. */
  async buildPdf() {
    await loadPdfLibs();
    this.preparePrint();
    const eff = this.effOrient();
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 350));
      const el = document.getElementById('map');
      const mr = el.getBoundingClientRect();
      const rects = [...el.querySelectorAll('svg')].map((sv) => { const b = sv.getBoundingClientRect(); return { sv, r: { left: b.left - mr.left, top: b.top - mr.top, width: b.width, height: b.height } }; });
      let svgs = null;
      const canvas = await html2canvas(el, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false,
        /* html2canvas mangles inline SVG inside transformed Leaflet panes: swap each SVG for an <img>
           of the same SVG, placed directly in #map at its on-screen position (no transformed ancestors) */
        onclone: (doc) => {
          svgs = [...doc.querySelectorAll('#map svg')];
          const cm = doc.getElementById('map');
          rects.forEach(({ sv, r }, i) => {
            const csv = svgs[i]; if (!csv || r.width < 1) return;
            if (!csv.getAttribute('xmlns')) csv.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            csv.removeAttribute('style'); csv.setAttribute('width', r.width); csv.setAttribute('height', r.height);
            const img = doc.createElement('img');
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(csv));
            Object.assign(img.style, { position: 'absolute', margin: '0', transform: 'none', maxWidth: 'none', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', pointerEvents: 'none' });
            csv.remove();
            if (sv.classList.contains('cap')) cm.appendChild(img); else cm.insertBefore(img, cm.firstChild);
          });
        } });
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: eff, unit: 'in', format: 'letter' });
      const PW = eff === 'landscape' ? 11 : 8.5, PH = eff === 'landscape' ? 8.5 : 11, M = 0.4;
      const aw = PW - 2 * M, ah = PH - 2 * M, ar = canvas.width / canvas.height;
      let w = aw, h = w / ar;
      if (h > ah) { h = ah; w = h * ar; }
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (PW - w) / 2, (PH - h) / 2, w, h);
      return { pdf, canvas };
    } finally { this.endPrint(); }
  },
  setBusy(b) {
    for (const btn of document.querySelectorAll('.js-print')) { btn.disabled = b; btn.setAttribute('aria-busy', b ? 'true' : 'false'); }
    for (const lbl of document.querySelectorAll('.js-printlbl')) {
      if (lbl.dataset.idle == null) lbl.dataset.idle = lbl.textContent;
      lbl.textContent = b ? (lbl.dataset.busy || i18n('Making page…')) : lbl.dataset.idle;
    }
  },
  async print() {
    if (this.busy || this.printing) return;
    this.busy = true; this.setBusy(true);
    try {
      await this.loadWorld?.(); /* print from the detailed 50m outline, not the quick 110m one */
      const dl = await this.dlReady;
      const inFrame = window.self !== window.top;
      if (!dl && !inFrame) { await this.nativePrint(); return; }
      const { pdf } = await this.buildPdf();
      const blob = pdf.output('blob');
      if (dl) {
        try { await dl.save({ filename: i18n('coloring-page.pdf'), data: blob }); return; }
        catch (e) { if (e && e.code === 'declined') return; /* otherwise fall back */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = i18n('coloring-page.pdf');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) { console.error('print failed', e); }
    finally { this.busy = false; this.setBusy(false); }
  },
  nativePrint() {
    return new Promise((resolve) => {
      this.preparePrint();
      let done = false;
      const fin = () => { if (done) return; done = true; window.removeEventListener('afterprint', fin); this.endPrint(); resolve(); };
      window.addEventListener('afterprint', fin);
      setTimeout(() => {
        try { window.print(); } catch (e) { fin(); return; }
        setTimeout(fin, 120000); /* safety net if afterprint never fires */
      }, 150);
    });
  }
};

/* ---------- share links ----------
   Share link puts the view and the map settings in the URL fragment (#…), which browsers never send to the server. Words
   typed on the map and anything under My data stay out of it, and the view is rounded and capped at region scale so a
   link can't point at a street. Settings at their page default are left out to keep links short. */
const SHARE_KEYS = ['showCountries', 'wCountry', 'showStates', 'wState', 'showCounties', 'wCounty', 'wNation', 'names', 'capitals', 'tornado', 'mine', 'hollow', 'contNames', 'oceanNames', 'grid', 'equator', ...CONTS.map((c) => c[1]), 'orient', 'proj'];
const SHARE_ENUMS = { orient: ['auto', 'landscape', 'portrait'], proj: Object.keys(SHAPES) };
const SHARE_DEFAULTS = Object.fromEntries(SHARE_KEYS.map((k) => [k, root[k]]));
const SHARE_W = 1000, SHARE_MAX_Z = 9; /* zoom is stored as if the frame were 1000px wide, so it means the same on any screen */
Object.assign(app, {
  shareUrl() {
    const p = new URLSearchParams(), f = this.frameRect;
    const c = map.containerPointToLatLng([f.left + f.width / 2, f.top + f.height / 2]);
    const z = Math.min(SHARE_MAX_Z, map.getZoom() + Math.log2(SHARE_W / f.width));
    p.set('at', [c.lat.toFixed(2), c.lng.toFixed(2), z.toFixed(2)].join(','));
    for (const k of SHARE_KEYS) {
      const v = k === 'orient' ? this.effOrient() : root[k]; /* the page as it looks now, even if the other screen is turned the other way */
      if (v !== SHARE_DEFAULTS[k]) p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    }
    return location.origin + location.pathname + '#' + p.toString().replace(/%2C/g, ',');
  },
  /* the settings and view in a share fragment, checked against what the controls allow; null if it isn't one */
  readShare(hash) {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    if (!p.has('at')) return null;
    const sig = {};
    for (const k of SHARE_KEYS) {
      const d = SHARE_DEFAULTS[k], v = p.get(k);
      if (v == null) sig[k] = d;
      else if (typeof d === 'boolean') sig[k] = v === '1';
      else if (typeof d === 'number') { const n = parseFloat(v); sig[k] = Number.isFinite(n) ? Math.max(0.25, Math.min(8, n)) : d; }
      else sig[k] = SHARE_ENUMS[k].includes(v) ? v : d;
    }
    if (!CONTS.some((c) => sig[c[1]])) for (const c of CONTS) sig[c[1]] = true; /* at least one continent stays on */
    const [lat, lng, z] = p.get('at').split(',').map(Number);
    const at = [lat, lng, z].every(Number.isFinite) ? { lat: Math.max(-85, Math.min(85, lat)), lng: Math.max(-360, Math.min(360, lng)), z: Math.min(SHARE_MAX_Z, z) } : null;
    return { sig, at };
  },
  /* centre the frame on a shared view, scaled to this screen's frame */
  showShared(at) {
    const f = this.frameRect, sz = map.getSize();
    const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), at.z - Math.log2(SHARE_W / f.width)));
    const dx = (f.left + f.width / 2) - sz.x / 2, dy = (f.top + f.height / 2) - sz.y / 2;
    map.setView(map.unproject(map.project([at.lat, at.lng], z).subtract([dx, dy]), z), z, { animate: false });
    this.userMoved = true;
  },
  /* apply a share fragment, then drop it from the address bar so it doesn't go stale as the page changes */
  takeShare() {
    const sh = this.readShare(location.hash);
    if (!sh) return null;
    history.replaceState(null, '', location.pathname + location.search);
    this.closePop();
    patch(sh.sig);
    if (sh.at) this.userMoved = true;
    return sh;
  },
  async share() {
    const url = this.shareUrl();
    if (mq.phone.matches && navigator.share) {
      try { await navigator.share({ url, title: document.title }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); this.toast(i18n('Link copied')); }
    catch (e) { window.prompt(i18n('Copy this link'), url); }
  },
  toast(msg) {
    clearTimeout(this._toastT);
    patch({ toast: msg });
    this._toastT = setTimeout(() => patch({ toast: '' }), 2200);
  }
});
/* a share link opened in a tab that already has the page */
window.addEventListener('hashchange', () => { const sh = app.takeShare(); if (sh && sh.at) requestAnimationFrame(() => app.showShared(sh.at)); });

/* Features pager: swipe left/right (40px) to change page; a swipe never also presses the tile under the finger */
{
  const pager = document.getElementById('featPager');
  let sx = null, sy = 0, swallow = false;
  const go = (d) => patch({ featPage: Math.max(0, Math.min(2, root.featPage + d)) });
  pager.addEventListener('pointerdown', (e) => { if (e.isPrimary) { sx = e.clientX; sy = e.clientY; } });
  pager.addEventListener('pointercancel', () => { sx = null; });
  pager.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { go(dx < 0 ? 1 : -1); swallow = true; setTimeout(() => { swallow = false; }, 400); }
  });
  pager.addEventListener('click', (e) => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
}

/* html2canvas + jsPDF are only needed for PDF export: load on demand (warmed on first hover/press of a Print button) */
const libs = {};
const loadScript = (src) => libs[src] || (libs[src] = new Promise((res, rej) => {
  const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { delete libs[src]; rej(new Error('failed to load ' + src)); };
  document.head.appendChild(el);
}));
const loadPdfLibs = () => Promise.all([loadScript('/vendor/html2canvas.min.js'), loadScript('/vendor/jspdf.umd.min.js')]);
for (const ev of ['pointerover', 'focusin', 'touchstart']) document.addEventListener(ev, (e) => { if (e.target.closest && e.target.closest('.js-print')) loadPdfLibs().catch(() => {}); }, { once: false, passive: true });

/* Fast buttons: [data-fast] acts on pointerdown instead of waiting for click. The follow-up real click from the same
   press is swallowed; keyboard clicks (detail 0) and scripted clicks pass through. Not used for Print/links. */
const fastClick = (() => {
  const stamp = new WeakMap();
  const scrollable = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return true; } return false; };
  document.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const b = e.target.closest && e.target.closest('[data-fast]');
    if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
    if (e.pointerType !== 'mouse' && scrollable(b)) return; /* a touch inside a scrolling sheet may be a scroll: wait for click */
    stamp.set(b, Date.now());
    b.click();
  }, true);
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || e.detail === 0) return;
    const b = e.target.closest && e.target.closest('[data-fast]');
    const t = b && stamp.get(b);
    if (t && Date.now() - t < 1500) { stamp.delete(b); e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
})();

/* native-print case only (e.g. browser menu print); our own flows manage printing themselves */
window.addEventListener('beforeprint', () => { if (!app.busy) app.preparePrint(); });
window.addEventListener('afterprint', () => { if (!app.busy) app.endPrint(); });
/* resolve the downloads capability once, without blocking first paint (may resolve null after ~10s) */
app.dlReady = (async () => {
  try { return window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { return null; }
})();
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); app.print(); }
  if (e.key === 'Escape') { app.closePop(); patch({ panel: '' }); }
});
const relayout = () => {
  if (app.printing) return;
  app.sizing = true; /* invalidateSize ends with a moveend: don't clamp to the old frame there, layoutFrame clamps to the new one */
  map.invalidateSize({ animate: false });
  app.sizing = false;
  app.layoutFrame(!app.userMoved);
};
/* Refitting redraws every outline, so while a resize is under way (dragging the window edge, a sheet opening) the frame moves
   at once but the drawn map is only scaled and shifted with CSS to keep its place in the frame, which the compositor
   handles. The real relayout runs once, 150ms after the last resize. */
/* The map's pane is moved with the individual translate and scale properties, which compose with the transform Leaflet keeps on it;
   the map element itself keeps the stage's size, so its white page stays under the whole frame. */
const stageEl = document.getElementById('stage'), pane = map.getPane('mapPane');
let rlTimer = 0, from = null;
const settle = () => {
  rlTimer = 0; from = null; stageEl.classList.remove('resizing');
  Object.assign(pane.style, { translate: '', scale: '' });
  relayout();
};
const relayoutSoon = () => {
  if (app.printing || !app.frameRect) return;
  if (!from) {
    from = { f: app.frameRect, sz: map.getSize(), refit: !app.userMoved };
    stageEl.classList.add('resizing');
  }
  const sz = L.point(stageEl.clientWidth, stageEl.clientHeight), f = app.frameFor(sz), o = from.f;
  app.placeFrame(f);
  if (from.refit) { /* the fit is proportional to the frame, so scale the old view about the old frame's centre onto the new one */
    const k = Math.min(f.width / o.width, f.height / o.height);
    const tx = f.left + f.width / 2 - k * (o.left + o.width / 2), ty = f.top + f.height / 2 - k * (o.top + o.height / 2);
    Object.assign(pane.style, { translate: `${tx}px ${ty}px`, scale: String(k) });
  } else { /* invalidateSize keeps the centre, then clampToFrame keeps land in the frame */
    const by = [(sz.x - from.sz.x) / 2, (sz.y - from.sz.y) / 2], [dx, dy] = app.clampDelta(f, by);
    pane.style.translate = `${by[0] + dx}px ${by[1] + dy}px`;
  }
  clearTimeout(rlTimer); rlTimer = setTimeout(settle, 150);
};
app.flushResize = () => { if (rlTimer) { clearTimeout(rlTimer); settle(); } };
const ro = new ResizeObserver(relayoutSoon);
/* the frame also avoids the phone dock, orientation control and open sheets, so watch them too */
for (const el of document.querySelectorAll('#stage,#dock,#orientSeg,.card,#placeSheet')) ro.observe(el); /* #stage, not #map: #map is pinned while a resize settles */
mq.phone.addEventListener('change', relayoutSoon); mq.tablet.addEventListener('change', relayoutSoon);

for (const ev of ['pointerdown','wheel']) document.getElementById('stage').addEventListener(ev, () => { app.userMoved = true; }, { capture: true, passive: true });
map.on('zoomend', () => app.renderLabels());
map.on('moveend', () => app.clampToFrame());
map.on('click', (e) => {
  if (!app.s) return;
  if (Date.now() - (app._selAt || 0) < 100) return; /* the same tap just opened a place sheet */
  if (mq.phone.matches && document.querySelector('.app').classList.contains('has-sheet')) { app.clearSel(); patch({ panel: '', popOpen: false }); return; }
  if (app.s.tool === 'text') {
    const { t } = app.addTag(e.latlng, '');
    t.focus();
  }
});

/* ---------- load data ---------- */
(async () => {
  try {
    const load = (n, priority = 'auto') => fetch(asset(`/data/${n}.json`), { priority }).then((r) => r.json());
    /* the world outline comes in twice: a light 110m one to draw quickly, then the detailed 50m one (fetched once the rest is in) */
    const [states, labels, caps, torn, world, wlabels, wcaps, prov, cont] = await Promise.all(
      ['states-10m', 'labels', 'capitals', 'tornadoes', 'world-110m', 'world-labels', 'world-capitals', 'world-provinces-50m', 'continents'].map((n) => load(n)));
    // Keep the 50 states + DC; drop territories (PR, GU, VI, AS, MP: FIPS >= 60).
    states.objects.states.geometries = states.objects.states.geometries.filter((g) => +g.id < 60);
    states.objects.nation = states.objects.states;
    const feats = fixFeatures(topojson.feature(states, states.objects.states));
    app.data.features = feats.features;
    app.data.labels = labels.labels.map((l) => {
      const display = nameOf(l.name, l.name);
      return { ...l, display, short: display === l.name ? l.short : null, tornadoes: l.tornadoes != null ? l.tornadoes : (torn.values[l.name] ?? null) };
    });

    // world: every country is tagged with a continent (data/continents.json); all continents start switched on
    const contOf = (o) => (o.id ? cont.ids[o.id] : cont.names[o.properties.name]) || null;
    prov.letters = cont.provinces;
    const NAME_FIX = { 'N. Cyprus': 'Turkish Republic of Northern Cyprus' };
    /* switch to a world outline: topology for the border/coast meshes, and each place's country shape (for search and fills) */
    const useWorld = (world) => {
      const wc = world.objects.countries;
      app.topo = { world, wc, gcont: new Map(wc.geometries.map((g) => [g, contOf(g)])), prov };
      const wfeats = fixFeatures(topojson.feature(world, wc));
      const byIso = {}, byName = {};
      wfeats.features.forEach((f) => { if (f.id) byIso[f.id] = f; else byName[NAME_FIX[f.properties.name] || f.properties.name] = f; });
      for (const p of app.places) {
        const l = p.src, lc = (l.iso && cont.ids[l.iso]) || cont.names[l.name] || null;
        const f = (l.iso && byIso[l.iso]) || byName[l.name] || null;
        Object.assign(p, { feature: f, fname: f ? f.properties.name : null, cont: f ? contOf(f) || lc : lc });
      }
      app._cands = null;
      return wfeats;
    };
    for (const l of wlabels.labels) {
      if (l.iso === '010' || l.a3 === 'ATA') continue;
      let display = l.name;
      if (/^People's Republic of China/.test(display)) display = 'China';
      if (display === 'United States of America') display = 'United States';
      const key = 'c:' + (l.iso || l.a3 || l.name), en = display;
      display = nameOf(key, display);
      app.places.push({ key, display, en, short: l.short && display === en && l.short !== display ? l.short : null, minLabel: l.minLabel, rank: l.rank, a3: l.a3, lat: l.lat, lng: l.lng, src: l });
    }
    const wfeats = useWorld(world);
    const list = document.getElementById('places');
    const seen = new Set();
    [i18n('World'), nameOf('c:840', 'United States'), ...app.places.filter((p) => p.a3 !== 'USA').map((p) => p.display).sort((a, b) => a.localeCompare(b)), ...feats.features.map((f) => nameOf(f.properties.name, f.properties.name))]
      .forEach((n) => { if (seen.has(n)) return; seen.add(n); const o = document.createElement('option'); o.value = n; list.appendChild(o); });

    const base = { color: INK, lineJoin: 'round', lineCap: 'round', fill: false, interactive: false };
    const fillStyle = { stroke: false, fill: true, fillColor: '#FFC93C', fillOpacity: 0 };
    let placeOf;
    app.layers.countries = L.geoJSON(null, {
      style: fillStyle,
      onEachFeature: (f, lyr) => {
        app.fills.push({ lyr, cont: contOf(f) });
        const p = placeOf.get(f); if (!p) return;
        app.placeLayers[p.key] = lyr;
        lyr.on('click', (e) => { if (app.s && app.s.tool === 'move') app.selectPlace(p.key, p.display, e.containerPoint); });
      }
    }).addTo(map);
    /* the invisible country fills that catch clicks and show the picked place */
    const fillCountries = (wfeats) => {
      for (const k in app.placeLayers) if (k.startsWith('c:')) delete app.placeLayers[k];
      app.fills = [];
      placeOf = new Map(app.places.filter((p) => p.feature).map((p) => [p.feature, p]));
      app.layers.countries.clearLayers().addData({ type: 'FeatureCollection', features: wfeats.features.filter((f) => f.id !== '840') });
    };
    fillCountries(wfeats);
    app.layers.states = L.geoJSON(feats, {
      style: fillStyle,
      onEachFeature: (f, lyr) => {
        app.placeLayers[f.properties.name] = lyr;
        lyr.on('click', (e) => { if (app.s && app.s.tool === 'move') app.selectPlace(f.properties.name, nameOf(f.properties.name, f.properties.name), e.containerPoint); });
      }
    }).addTo(map);
    const mk = (w, mesh) => L.geoJSON(mesh ? clean(mesh) : null, { style: { ...base, weight: w }, interactive: false }).addTo(map);
    app.layers.borders = mk(1.25);
    app.layers.coast = mk(2);
    app.layers.provinces = mk(1.25);
    app.layers.stateMesh = mk(1.25, topojson.mesh(states, states.objects.states, (a, b) => a !== b));
    app.layers.nation = mk(2, topojson.mesh(states, states.objects.nation, (a, b) => a === b));
    /* lat/long grid and the equator + tropics: thin dashed lines (drawGrid) */
    const dash = { color: INK, interactive: false, lineJoin: 'round' };
    app.layers.grid = L.polyline([], { ...dash, weight: 0.9, dashArray: '2 6', opacity: 0.8 });
    app.layers.equator = L.polyline([], { ...dash, weight: 1.75, dashArray: '9 7' });
    app.drawGrid();
    /* the curved shapes' edge, drawn like the coastline: both 180° meridians and the poles (a curve in Winkel Tripel) */
    const st = (n, f) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
    app.layers.rim = L.polyline([...st(90, (t) => [-90 + 180 * t, -180]), ...st(90, (t) => [90, -180 + 360 * t]), ...st(90, (t) => [90 - 180 * t, 180]), ...st(90, (t) => [-90, 180 - 360 * t])], { ...base, weight: 2 });

    const mkLbl = (lat, lng) => L.marker([lat, lng], { icon: L.divIcon({ className: 'lbl-wrap', html: '', iconSize: [0, 0] }), interactive: false, keyboard: false }).addTo(map);
    for (const l of app.data.labels) app.labelMarkers[l.name] = mkLbl(l.lat, l.lng);
    const fixed = (cls, text) => L.divIcon({ className: 'lbl-wrap', html: `<div class="lbl"><span class="${cls}">${esc(text)}</span></div>`, iconSize: [0, 0] });
    const mkFixed = (cls, text, lat, lng) => L.marker([lat, lng], { icon: fixed(cls, text), interactive: false, keyboard: false, zIndexOffset: -50 });
    for (const [cont, lat, lng] of CONT_LABELS) { const text = i18n(cont); app.contMarkers.push({ cont, text, lat, lng, m: mkFixed('cn', text, lat, lng) }); }
    for (const [en, lat, lng] of OCEAN_LABELS) { const text = i18n(en); app.oceanMarkers.push({ text, lat, lng, m: mkFixed('on-lbl', text, lat, lng) }); }
    for (const p of app.places) p.marker = mkLbl(p.lat, p.lng);
    const contByA3 = Object.fromEntries(app.places.filter((p) => p.a3).map((p) => [p.a3, p.cont]));
    const contByName = Object.fromEntries(app.places.map((p) => [p.en, p.cont]));
    const star = (c, minZoom) => app.capMarkers.push({ minZoom, m: L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'lbl-wrap', html: STAR, iconSize: [0, 0] }), interactive: false, keyboard: false, zIndexOffset: -100 }) });
    for (const c of caps) star(c, STATE_Z);
    for (const c of wcaps) star(c, c.minZoom);
    for (const c of app.capMarkers) c.cont = NA;
    wcaps.forEach((c, i) => { app.capMarkers[caps.length + i].cont = contByA3[c.a3] || contByName[c.country] || null; });
    app.capMarkers.forEach((c) => { if (!c.cont) console.warn('capital without continent', c); });
    app.applyConts();
    if (app.s) app.sync(app.s);

    /* the detailed outline (240 KB): fetched once the browser is idle after the first draw, or right away on zoom-in or
       print, then swapped in without touching the open popover or the picked place */
    let worldP;
    app.loadWorld = () => worldP || (worldP = load('world-50m', 'low').then((w50) => {
      fillCountries(useWorld(w50));
      for (const f of app.fills) if (!app.vis.has(f.cont)) app.layers.countries.removeLayer(f.lyr);
      if (app.selected && app.placeLayers[app.selected]) app.placeLayers[app.selected].setStyle({ fillColor: '#FFC93C', fillOpacity: 0.4 });
      app.drawWorldLines();
      if (app.s) app.sync(app.s);
    }).catch((e) => { worldP = null; console.error('detailed world map failed', e); }));
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 0));
    setTimeout(() => idle(() => app.loadWorld(), { timeout: 3000 }), 3000);
    map.on('zoomend', () => { if (map.getZoom() >= 3) app.loadWorld(); });
  } catch (e) { console.error('data load failed', e); }
  finally { requestAnimationFrame(() => document.getElementById('stage').classList.add('drawn')); }
})();

const shared = app.takeShare(); /* a share link: its settings go in before the first sync */
/* the Datastar effect ran before the component built the map: seed the first sync from the current signals */
app.sync(Object.fromEntries(['showCountries','wCountry','showStates','wState','showCounties','wCounty','wNation','names','capitals','tornado','mine','hollow','contNames','oceanNames','grid','equator','cAfrica','cAntarctica','cAsia','cEurope','cNorthAmerica','cOceania','cSouthAmerica','orient','tool','proj'].map((k) => [k, root[k]])));

/* initial frame + fit */
app.layoutFrame(true);
requestAnimationFrame(() => {
  map.invalidateSize({ animate: false }); app.layoutFrame(true);
  if (shared && shared.at) app.showShared(shared.at);
  document.getElementById('stage').classList.add('framed'); /* the empty white page fades in; the outlines follow with .drawn */
});
