/* Native print and PDF export (html2canvas + jsPDF, loaded on demand). Methods mixed into app (they use `this`). */
import { map } from './map.js';

/* html2canvas + jsPDF are only needed for PDF export: load on demand (warmed on first hover/press of a Print button) */
const libs = {};
const loadScript = (src) => libs[src] || (libs[src] = new Promise((res, rej) => {
  const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { delete libs[src]; rej(new Error('failed to load ' + src)); };
  document.head.appendChild(el);
}));
const loadPdfLibs = () => Promise.all([loadScript('vendor/html2canvas.min.js'), loadScript('vendor/jspdf.umd.min.js')]);
export { loadPdfLibs };

export const printing = {
  /* ---------- print ---------- */
  preparePrint() {
    if (this.printing) return;
    this.printing = true;
    const eff = this.effOrient();
    this.saved = { center: map.getCenter(), zoom: map.getZoom(), sel: this.selected, minZoom: map.getMinZoom() };
    map.setMaxBounds(null); map.setMinZoom(-3);
    const bounds = this.frameBounds();
    this.clearSel();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    let st = document.getElementById('pagecss');
    if (!st) { st = document.createElement('style'); st.id = 'pagecss'; document.head.appendChild(st); }
    st.textContent = `@page { size: letter ${eff}; margin: 0.4in }`;
    const [pw, ph] = eff === 'landscape' ? [10.2, 7.7] : [7.7, 10.2];
    document.body.style.setProperty('--pw', pw + 'in');
    document.body.style.setProperty('--ph', ph + 'in');
    document.body.classList.add('printing');
    map.invalidateSize({ animate: false });
    map.fitBounds(bounds, { animate: false, padding: [0, 0] });
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
      lbl.textContent = b ? (lbl.dataset.busy || 'Making page\u2026') : lbl.dataset.idle;
    }
  },
  async print() {
    if (this.busy || this.printing) return;
    this.busy = true; this.setBusy(true);
    try {
      const dl = await this.dlReady;
      const inFrame = window.self !== window.top;
      if (!dl && !inFrame) { await this.nativePrint(); return; }
      const { pdf } = await this.buildPdf();
      const blob = pdf.output('blob');
      if (dl) {
        try { await dl.save({ filename: 'coloring-page.pdf', data: blob }); return; }
        catch (e) { if (e && e.code === 'declined') return; /* otherwise fall back */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'coloring-page.pdf';
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
