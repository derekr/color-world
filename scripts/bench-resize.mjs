// Resize benchmark: drags the window size through a shrink-and-grow cycle and measures main-thread cost, frame pacing,
// layout shift, and how closely the frame and the map track each other during the drag.
// usage: node scripts/bench-resize.mjs <url> [--cpu 4] [--runs 3] [--steps 60] [--json]
const args = process.argv.slice(2);
const url = args[0] || 'http://localhost:8123/';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const cpu = +opt('cpu', 1), runs = +opt('runs', 3), steps = +opt('steps', 60), asJson = opt('json', false);
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }

const W0 = 1920, H0 = 1080, W1 = 1280, H1 = 760;
const at = (i) => { const t = i / steps, k = t < 0.5 ? t * 2 : 2 - t * 2; return { width: Math.round(W0 + (W1 - W0) * k), height: Math.round(H0 + (H1 - H0) * k) }; };

/* in-page probe: where the frame is, and where two fixed places on the map land on screen (through any transform on #map) */
const probe = () => {
  const m = window.app.map, pane = m.getPane('mapPane'), st = document.getElementById('stage').getBoundingClientRect();
  const fr = document.getElementById('frame').getBoundingClientRect();
  // any CSS translate/scale on the map pane (a resize preview) on top of where Leaflet puts things
  const cs = getComputedStyle(pane), tr = cs.translate === 'none' ? [0, 0] : cs.translate.split(' ').map(parseFloat), k = cs.scale === 'none' ? 1 : parseFloat(cs.scale);
  const scr = (ll) => { const p = m.latLngToContainerPoint(ll); return [st.left + (tr[0] || 0) + k * p.x, st.top + (tr[1] || 0) + k * p.y]; };
  const a = scr([0, -60]), b = scr([0, 60]);
  // map position expressed in frame units: where the two places sit relative to the frame box
  // where the frame should be for the stage's current size (desktop insets: 56 top, 84 bottom, 24 sides; 11 x 8.5 page)
  const mw = st.width - 48, mh = st.height - 140, r = st.width > st.height ? 11 / 8.5 : 8.5 / 11;
  let w = mw, h = w / r; if (h > mh) { h = mh; w = h * r; }
  const ix = st.left + 24 + (mw - w) / 2, iy = st.top + 56 + (mh - h) / 2;
  const lag = Math.max(Math.abs(fr.left - ix), Math.abs(fr.top - iy), Math.abs(fr.width - w), Math.abs(fr.height - h));
  return { lag, fx: fr.left, fy: fr.top, fw: fr.width, fh: fr.height, ax: (a[0] - fr.left) / fr.width, ay: (a[1] - fr.top) / fr.height, bx: (b[0] - fr.left) / fr.width };
};

const one = async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W0, height: H0 } });
  await p.addInitScript(() => {
    window.__b = { ls: 0, lt: 0, ltMax: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__b.ls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__b.lt += e.duration; window.__b.ltMax = Math.max(window.__b.ltMax, e.duration); } }).observe({ type: 'longtask' });
  });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => document.getElementById('stage').classList.contains('drawn'));
  await p.waitForLoadState('networkidle'); // the detailed outlines load after the first draw
  await p.waitForTimeout(1500);
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const settled0 = await p.evaluate(probe);
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await p.evaluate(() => { const b = window.__b; b.ls = 0; b.lt = 0; b.ltMax = 0; b.frames = []; const tick = (t) => { if (b.frames) { b.frames.push(t); requestAnimationFrame(tick); } }; requestAnimationFrame(tick); });
  const m0 = await metric();
  const t0 = Date.now(), samples = [];
  for (let i = 1; i <= steps; i++) {
    await p.setViewportSize(at(i));
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    samples.push(await p.evaluate(probe));
  }
  const dragMs = Date.now() - t0;
  const m1 = await metric();
  await p.waitForTimeout(2500);
  const m2 = await metric();
  const end = await p.evaluate(() => { const f = window.__b.frames; window.__b.frames = null; let gap = 0; for (let i = 1; i < f.length; i++) gap = Math.max(gap, f[i] - f[i - 1]); return { ...window.__b, frames: f.length, gap }; });
  const settled = await p.evaluate(probe);
  // lag: worst distance (px) between the frame and where it should be for the current size during the drag
  // drift: during the drag, how far the map drifted from where it ends up relative to the frame (0 = locked to the frame)
  const drift = Math.max(...samples.map((s) => Math.max(Math.abs(s.ax - settled.ax), Math.abs(s.ay - settled.ay), Math.abs(s.bx - settled.bx)))) * 100;
  await b.close();
  const d = (k) => (m1[k] - m0[k]) * 1000;
  const lag = Math.max(...samples.map((s) => s.lag));
  return { dragMs, lag, taskTotal: (m2.TaskDuration - m0.TaskDuration) * 1000, task: d('TaskDuration'), script: d('ScriptDuration'), layout: d('LayoutDuration'), style: d('RecalcStyleDuration'),
    longTask: end.lt, longestTask: end.ltMax, worstFrameGap: end.gap, cls: end.ls, drift, final: settled, start: settled0 };
};

const all = [];
for (let r = 0; r < runs; r++) all.push(await one());
const med = (k) => { const v = all.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const out = Object.fromEntries(['dragMs', 'taskTotal', 'task', 'script', 'layout', 'style', 'longTask', 'longestTask', 'worstFrameGap', 'cls', 'drift', 'lag'].map((k) => [k, +med(k).toFixed(k === 'cls' ? 4 : 0)]));
out.final = all[0].final;
console.log(asJson ? JSON.stringify(out) : out);
