/* Find a country or state by name and fit the frame to it. Methods mixed into app (they use `this`). */
import { FIT, FIT_OPTS, NA, US_BOUNDS } from './constants.js';

export const search = {
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
    const c = [{ name: 'World', b: this.visBounds() }];
    if (this.vis.has(NA)) c.push({ name: 'United States', b: US_BOUNDS });
    const cs = [...this.places].filter((p) => p.a3 !== 'USA' && this.vis.has(p.cont)).sort((a, b) => (a.rank - b.rank) || a.display.localeCompare(b.display));
    for (const p of cs) {
      if (!p.feature) continue;
      const fo = FIT[p.fname];
      c.push({ name: p.display, alt: p.fname, b: fo ? L.latLngBounds(fo) : this.boundsOf(p.feature.geometry, FIT_OPTS[p.fname]) });
    }
    for (const f of this.vis.has(NA) ? this.data.features || [] : []) c.push({ name: f.properties.name, b: this.boundsOf(f.geometry, f.properties.name === 'Alaska' ? { maxLng: 0 } : {}) });
    return (this._cands = c);
  },
  search(q) {
    q = (q || '').trim().toLowerCase(); if (!q) return;
    if (q === 'usa' || q === 'us') q = 'united states';
    const c = this.candidates();
    const nm = (x) => [x.name.toLowerCase(), (x.alt || '').toLowerCase()];
    const hit = c.find((x) => nm(x).includes(q)) || c.find((x) => nm(x).some((n) => n.startsWith(q))) || c.find((x) => nm(x).some((n) => n.includes(q)));
    if (hit && hit.b.isValid()) { this.userMoved = true; this.fitTo(hit.b); }
  }
};
