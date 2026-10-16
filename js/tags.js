/* Free text tags the user drops on the map. Methods mixed into app (they use `this`). */
import { map } from './map.js';

export const tags = {
  /* ---------- free text ---------- */
  addTag(latlng, text = 'My words') {
    const wrap = document.createElement('div');
    wrap.className = 'ft';
    wrap.innerHTML = '<span class="ft-grip" role="button" tabindex="0" aria-label="Move text"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg></span><span class="ft-t" contenteditable="true" role="textbox" aria-label="Text"></span><button class="ft-x" aria-label="Delete text"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E1B18" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
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
  }
};
