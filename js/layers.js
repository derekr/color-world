/* Apply the Datastar signals to the map layers; county lines load on demand. Methods mixed into app (they use `this`). */
import { root } from '../vendor/datastar-rocket.js';
import { CONTS, INK, NA, PROV_CONT } from './constants.js';
import { clean } from './geo.js';
import { patch } from './dom.js';
import { map } from './map.js';

export const layers = {
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
    if (!prev || prev.orient !== s.orient) this.layoutFrame(!this.userMoved);
    else if (contChanged && L_.states && this.frameRect) { this.userMoved = false; this.fitTo(this.visBounds(), false); }
    this.renderLabels();
  },
  /* show/hide everything that belongs to a continent that was switched off or on */
  applyConts() {
    const L_ = this.layers, vis = this.vis, v = (c) => vis.has(c);
    this.closePop();
    for (const f of this.fills) v(f.cont) ? L_.countries.addLayer(f.lyr) : L_.countries.removeLayer(f.lyr);
    const { world, wc, gcont, prov } = this.topo, vc = (o) => v(gcont.get(o)), notUS = (o) => o.id !== '840';
    L_.borders.clearLayers().addData(clean(topojson.mesh(world, wc, (a, b) => a !== b && notUS(a) && notUS(b) && vc(a) && vc(b))));
    /* coastline: arcs with exactly one included side (the other side is sea or a hidden continent) */
    L_.coast.clearLayers().addData(clean(topojson.mesh(world, wc, (a, b) => notUS(a) && notUS(b) && (a === b ? vc(a) : vc(a) !== vc(b)))));
    const pg = prov.objects.provinces.geometries.filter((g, i) => v(PROV_CONT[prov.letters[i]]));
    L_.provinces.clearLayers().addData(clean(topojson.mesh(prov, { type: 'GeometryCollection', geometries: pg })));
  },
  async loadCounties() {
    this.countiesLoading = true;
    try {
      const topo = await (await fetch('data/counties-10m.json')).json();
      topo.objects.counties.geometries = topo.objects.counties.geometries.filter((g) => +String(g.id).padStart(5, '0').slice(0, 2) < 60);
      const mesh = topojson.mesh(topo, topo.objects.counties, (a, b) => a !== b && String(a.id).slice(0, 2) === String(b.id).slice(0, 2));
      this.countyLayer = L.geoJSON(clean(mesh), { style: { color: INK, weight: this.s.wCounty, fill: false, lineJoin: 'round', lineCap: 'round' }, interactive: false, smoothFactor: 1 });
      this.sync(this.s);
    } catch (e) { console.error('counties failed', e); }
    this.countiesLoading = false;
  }
};
