import { mergePatch } from '../vendor/datastar-rocket.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const patch = (o) => mergePatch(o);
/* keep in sync with the CSS: phone = narrow OR short landscape (<500px tall, <1100 wide) */
export const mq = { phone: matchMedia('(max-width:699px), (max-width:1099px) and (max-height:499px)'), tablet: matchMedia('(min-width:700px) and (max-width:1099px) and (min-height:500px)') };
