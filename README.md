# Color World

A kid-friendly map you can turn into an 8.5 × 11 coloring page. Pick a place, toggle country, state and county lines, adjust line weights, add names, capitals or your own words, then print. You can also drop your own GeoJSON, TopoJSON or CSV (latitude/longitude columns) on the map: it is drawn in the same style and added as a toggleable tile under Features → My data, kept in the browser between visits.

It is a single static page (`index.html`) using [Leaflet](https://leafletjs.com) for the map and [Datastar + Rocket](https://data-star.dev) signals for the UI. The custom data feature lives in its own module, `datasets.js`, which `index.html` modulepreloads. No build step: serve the folder with any static server, e.g. `python3 -m http.server`.

## Data and libraries

- US states and counties: [us-atlas](https://github.com/topojson/us-atlas) (US Census Bureau)
- World countries: [world-atlas](https://github.com/topojson/world-atlas); label points, capitals and provinces: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- `samples/` holds the example files offered under Add data, made from the data above plus a few hand-placed points (national parks, Route 66, a road trip).
- Tornado counts in `data/tornadoes.json` are placeholders and need a real source.
- Vendored (no build step, see `vendor/` and `fonts/`):
  - Leaflet 1.9.4 (BSD-2-Clause)
  - Datastar 1.0.4 + Rocket beta.2, one bundle `vendor/datastar-rocket.js` (MIT)
  - topojson-client 3.1.0 (ISC)
  - html2canvas 1.4.1 (MIT), loaded on demand for PDF export
  - jsPDF 2.5.2 (MIT), loaded on demand for PDF export
  - Baloo 2 latin 500/600/700/800 woff2 from `@fontsource/baloo-2` 5.3.0 (SIL OFL 1.1, `fonts/OFL.txt`)
