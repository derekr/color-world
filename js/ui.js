/* DOM and map event wiring: features pager, fast buttons, print/keyboard shortcuts, resize, map clicks. */
import { root } from '../vendor/datastar-rocket.js';
import { mq, patch } from './dom.js';
import { map } from './map.js';
import { app } from './app.js';
import { loadPdfLibs } from './print.js';

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

/* html2canvas + jsPDF load on demand (see print.js): warm them on first hover/press of a Print button */
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
const relayout = () => { if (app.printing) return; map.invalidateSize({ animate: false }); app.layoutFrame(!app.userMoved); };
const ro = new ResizeObserver(relayout);
/* the frame also avoids the phone dock, orientation control and open sheets, so watch them too */
for (const el of document.querySelectorAll('#map,#dock,#orientSeg,.card,#placeSheet')) ro.observe(el);
mq.phone.addEventListener('change', relayout); mq.tablet.addEventListener('change', relayout);

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
