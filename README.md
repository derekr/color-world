# Color World

A kid-friendly map you can turn into an 8.5 × 11 coloring page. Pick a place, toggle country, state and county lines, adjust line weights, add names, capitals or your own words, then print.

It is a single static page (`index.html`) using [Leaflet](https://leafletjs.com) for the map and [Datastar](https://data-star.dev) signals for the UI. No build step: serve the folder with any static server, e.g. `python3 -m http.server`.

## Data and libraries

- US states and counties: [us-atlas](https://github.com/topojson/us-atlas) (US Census Bureau)
- World countries: [world-atlas](https://github.com/topojson/world-atlas); label points, capitals and provinces: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Tornado counts in `data/tornadoes.json` are placeholders and need a real source.
- Vendored: Leaflet 1.9.4, Datastar 1.0.3, topojson-client 3.1.0, html2canvas 1.4.1, jsPDF 2.5.2
