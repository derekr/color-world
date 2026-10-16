/* Place names (with the collision pass) and the place popover. Methods mixed into app (they use `this`). */
import { NA, STATE_Z } from './constants.js';
import { esc, mq, patch } from './dom.js';
import { map } from './map.js';

export const labels = {
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
      this.setLbl(m, na ? this.labelHtml(l.name, s.names && stateZ ? (l.short || l.name) : '', l.tornadoes) : '');
    }
    /* greedy collision pass: state names first, then countries by importance; drop names that would overlap */
    const placed = [];
    const fs = s.hollow ? 15 : 12.5, cw = fs * 0.6 + (s.hollow ? 0.6 : 0.3);
    const box = (pt, text, key) => {
      const w = Math.max(text.length * cw, this.words[key] && s.mine ? this.words[key].length * 7.5 + 16 : 0), h = fs + 3 + (this.words[key] && s.mine ? 20 : 0);
      return { x1: pt.x - w / 2, x2: pt.x + w / 2, y1: pt.y - h / 2, y2: pt.y + h / 2 };
    };
    const hit = (b) => placed.some((p) => b.x1 < p.x2 && b.x2 > p.x1 && b.y1 < p.y2 && b.y2 > p.y1);
    if (s.names && stateZ && na) for (const l of this.data.labels) placed.push(box(map.latLngToContainerPoint([l.lat, l.lng]), l.short || l.name, l.name));
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
  closePop() { this.clearSel(); patch({ popOpen: false }); }
};
