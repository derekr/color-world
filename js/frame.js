/* Print frame layout, fitting and keeping the world inside the frame. Methods mixed into app (they use `this`). */
import { root } from '../vendor/datastar-rocket.js';
import { CONTS, CONT_BOUNDS, FULL_BOUNDS, WORLD_BOUNDS } from './constants.js';
import { mq, patch } from './dom.js';
import { map } from './map.js';

export const frame = {
  /* ---------- layout / frame ---------- */
  effOrient() {
    const o = this.s ? this.s.orient : 'auto';
    if (o !== 'auto') return o;
    const sz = map.getSize();
    return sz.x > sz.y ? 'landscape' : 'portrait';
  },
  /* room kept clear around the print frame: depends on the layout (phone bar/dock/sheets, tablet rail, desktop) */
  insets(sz) {
    const d = { top: 56, bottom: 84, left: 24, right: 24 };
    const mr = document.getElementById('map').getBoundingClientRect();
    if (mq.phone.matches) {
      const h = document.querySelector('header').getBoundingClientRect();
      d.top = Math.max(0, h.bottom - mr.top) + (matchMedia('(max-height:499px)').matches ? 12 : 46); d.left = d.right = 16;
      let bt = sz.y;
      for (const el of document.querySelectorAll('#dock,#orientSeg,.card.open,#placeSheet')) {
        if (el.id === 'orientSeg' && matchMedia('(max-height:499px)').matches) continue; // sits in the top bar when sideways
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) bt = Math.min(bt, r.top - mr.top);
      }
      d.bottom = Math.max(0, sz.y - bt) + 14;
    } else if (mq.tablet.matches) d.left = 116;
    return d;
  },
  layoutFrame(refit) {
    const sz = map.getSize();
    const eff = this.effOrient();
    const r = eff === 'landscape' ? 11 / 8.5 : 8.5 / 11;
    const ins = this.insets(sz), top = ins.top;
    const maxW = Math.max(120, sz.x - ins.left - ins.right), maxH = Math.max(120, sz.y - top - ins.bottom);
    let w = maxW, h = w / r;
    if (h > maxH) { h = maxH; w = h * r; }
    const left = ins.left + (maxW - w) / 2, t = top + (maxH - h) / 2;
    this.frameRect = { left, top: t, width: w, height: h };
    const f = document.getElementById('frame');
    Object.assign(f.style, { left: left + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
    const auto = this.s && this.s.orient === 'auto';
    patch({ frameTag: (auto ? 'Auto · ' : '8.5 × 11 · ') + eff });
    const pad0 = L.point(sz.x - w * 0.94, sz.y - h * 0.94);
    map.setMinZoom(Math.max(mq.phone.matches || mq.tablet.matches ? -1 : 0.5, map.getBoundsZoom(FULL_BOUNDS, false, pad0) - 0.35));
    this.updateMaxBounds();
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
  frameBounds() {
    const f = this.frameRect;
    const sw = map.containerPointToLatLng([f.left, f.top + f.height]);
    const ne = map.containerPointToLatLng([f.left + f.width, f.top]);
    return L.latLngBounds(sw, ne);
  },
  /* The frame is off-centre (sidebar, dock, sheets, rail) and hidden continents shift the fit, so the frame (not the screen) is kept inside the world by clampToFrame instead of Leaflet's maxBounds. */
  updateMaxBounds() {
    if (this.printing) return;
    map.setMaxBounds(null);
  },
  clampToFrame() {
    if (this.printing || !this.frameRect) return;
    // keep the visible continents and the frame overlapping: smaller land can roam inside the frame, bigger land must cover it
    const f = this.frameRect, vb = this.visBounds(), a = map.latLngToContainerPoint(vb.getNorthWest()), b = map.latLngToContainerPoint(vb.getSouthEast());
    const fix = (lo, hi, flo, fhi) => (hi - lo <= fhi - flo) ? (lo < flo ? flo - lo : hi > fhi ? fhi - hi : 0) : lo > flo ? flo - lo : hi < fhi ? fhi - hi : 0;
    const dx = fix(a.x, b.x, f.left, f.left + f.width), dy = fix(a.y, b.y, f.top, f.top + f.height);
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) map.panBy([-dx, -dy], { animate: false });
  },
  fitTo(bounds, animate = true) {
    const f = this.frameRect, sz = map.getSize();
    const pad = L.point(sz.x - f.width * 0.94, sz.y - f.height * 0.94);
    const z = map.getBoundsZoom(bounds, false, pad);
    const zz = Math.min(z, 10);
    const pa = map.project(bounds.getSouthWest(), zz), pb = map.project(bounds.getNorthEast(), zz);
    // offset the centre when the frame is off-centre (sidebar, dock/sheets, rail), in one move so animation can't drop it
    const dy = (f.top + f.height / 2) - sz.y / 2, dx = (f.left + f.width / 2) - sz.x / 2;
    map.setView(map.unproject(pa.add(pb).divideBy(2).subtract([dx, dy]), zz), zz, { animate });
  }
};
