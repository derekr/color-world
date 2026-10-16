# Color World

A kid-friendly map you can turn into an 8.5 × 11 coloring page. Pick a place, toggle country, state and county lines, adjust line weights, add names, capitals or your own words, then print. You can also drop your own GeoJSON, TopoJSON or CSV (latitude/longitude columns) on the map: it is drawn in the same style and added as a toggleable tile under Features → My data, kept in the browser between visits.

It is a single static page (`index.html`) using [Leaflet](https://leafletjs.com) for the map and [Datastar + Rocket](https://data-star.dev) signals for the UI. The custom data feature lives in its own module, `datasets.js`, which `index.html` modulepreloads. No build step: serve the folder with any static server, e.g. `python3 -m http.server` (the translated pages need `npx wrangler dev`, see Locales).

Deploys add one step: the Workers Builds build command is `node scripts/stamp.mjs --write`, which adds `?v=<content hash>` to every reference to `fonts/`, `vendor/`, `data/`, `app.js` and `datasets.js` and marks those as cacheable for a year (`immutable`). Locally nothing is stamped and the files revalidate as usual. A path built at runtime has to go through `asset()` in app.js; the script fails the build if it finds a reference it couldn't version. Run `node scripts/stamp.mjs` (no `--write`) to check without changing files.

## Privacy

The site is for kids, so it keeps no logs, sets no cookies and loads nothing from other sites. [PRIVACY.md](PRIVACY.md) lists each promise next to the code that keeps it, and `node scripts/privacy.mjs` checks them. It runs before `scripts/locales.mjs` in wrangler's build, so a deploy fails if one breaks.

`osm.js` serves street data for the coming Neighborhood mode at `/osm/14/<x>/<y>.json`. It asks OpenStreetMap's Overpass service for one zoom-14 tile (buildings separately, at `-buildings.json`), sends none of the visitor's headers, and keeps only each shape's kind and public name. Workers Caching (`cache` in wrangler.jsonc) keeps each tile for a month and shares it between visitors.

## Locales

`index.html` is the US English page at color-world.perfectdays.dev. Each `locales/<lang>.json` gets its own copy of the page, built by `node scripts/locales.mjs` into `<dir>/index.html` (not committed): British English at colour-world.perfectdays.dev, and Spanish, French and German at `/es/`, `/fr/` and `/de/`. wrangler runs the script before every deploy, preview and `wrangler dev`, so on deploys it copies the stamped page. A header menu links the pages.

A locale file maps English to its own text: `html` for whole text nodes and attribute values in `index.html`, `replace` for exact snippets (English inside Datastar expressions), `js` for strings `app.js` and `datasets.js` pass through `i18n()` (with `{name}` slots), and `names` for place names, keyed by place key (`c:<iso>`) for countries and by English name for US states. Country and state names come from Natural Earth's `name_<lang>` columns (`ne_50m_admin_0_countries`, `ne_50m_admin_1_states_provinces`) with a few hand fixes; only names that differ from English are listed. Search matches both the translated and the English name. Anything left out stays English, and the build fails if a key stops matching or the locale is missing from `_headers` (its own Early Hints block), `wrangler.jsonc` (`run_worker_first`), `worker.js` (`DIRS`) or the language menu.

Asset URLs are root-absolute (`/app.js`, `/data/…`) so every page shares one cached copy. `worker.js` only runs for `/` and the locale folders: it serves `en-gb/index.html` at `/` on colour-world and redirects `/en-gb/` there from either live host. Use `npx wrangler dev` to try a locale page locally.

## Data and libraries

- US states and counties: [us-atlas](https://github.com/topojson/us-atlas) (US Census Bureau)
- World countries: [world-atlas](https://github.com/topojson/world-atlas) (`world-110m.json` is drawn first for a quick first paint; `world-50m.json` replaces it once the browser is idle, or right away on zoom-in or print); label points, capitals and provinces: [Natural Earth](https://www.naturalearthdata.com) (public domain)
- Street data for Neighborhood mode: [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL), fetched through Overpass by `osm.js`
- `samples/` holds the example files offered under Add data, made from the data above plus a few hand-placed points (national parks, Route 66, a road trip).
- Tornado counts in `data/tornadoes.json` are placeholders and need a real source.
- Vendored (no build step, see `vendor/` and `fonts/`):
  - Leaflet 1.9.4 (BSD-2-Clause)
  - Datastar 1.0.4 + Rocket beta.2, one bundle `vendor/datastar-rocket.js` (MIT). Patched: Rocket's MutationObserver scans each changed element once per batch instead of once per mutation record, which saves ~130 ms of main-thread work when Leaflet draws the map.
  - topojson-client 3.1.0 (ISC)
  - html2canvas 1.4.1 (MIT), loaded on demand for PDF export
  - jsPDF 2.5.2 (MIT), loaded on demand for PDF export
  - Baloo 2 latin 600/700/800 woff2 from `@fontsource/baloo-2` 5.3.0 (SIL OFL 1.1, `fonts/OFL.txt`)
