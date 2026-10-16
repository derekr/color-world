/* Geometry fixes for the 180° line. Pure functions, no Leaflet or DOM. */
/* Keep Russia and Alaska whole across the 180° line: Chukotka moves east of 180, the western Aleutians west of -180. */
export const fixPt = (p) => (p[0] < -169 && p[1] > 64.5) ? [p[0] + 360, p[1]] : (p[0] > 170 && p[1] > 50 && p[1] < 56) ? [p[0] - 360, p[1]] : p;
export const fixCoords = (c) => typeof c[0] === 'number' ? fixPt(c) : c.map(fixCoords);
export const fixFeatures = (fc) => { for (const f of fc.features) if (f.geometry) f.geometry.coordinates = fixCoords(f.geometry.coordinates); return fc; };
/* split lines where they jump across the antimeridian, and drop edges that run along it */
export const clean = (g) => {
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
