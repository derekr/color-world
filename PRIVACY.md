# Privacy

Color World is for kids, so it collects as little as it can and this page says exactly what that is. The code is open, and every promise below points at the line that keeps it. `scripts/privacy.mjs` checks the promises on every build and stops the deploy if one breaks. Run it yourself with `node scripts/privacy.mjs`.

## The short version

- **No accounts, no cookies, no ads, no fingerprinting.**
- **Nothing you draw, type or add leaves your browser.** Your words stay in the page, and files you drop on the map stay on your device.
- **We never ask where you are.** The site never uses your device's location, and it never asks for or sends a street address.
- **Everything loads from this site.** No other company's scripts, fonts or trackers.
- **We don't log visits.** The server keeps no request logs.

## What happens when you use it

| You do this | What happens | Where in the code |
| --- | --- | --- |
| Open the page | Your browser downloads the page, map outlines, fonts and scripts from this site only. Cloudflare, which hosts the site, handles the request as any web host does. | `index.html`, `_headers`. `scripts/privacy.mjs` fails if the page names another site. |
| Search for a place | The match happens inside your browser, against map data already loaded. Nothing is sent. | `app.js`, `search()` |
| Add words | They stay in the page and are gone when you close it. Never sent. | `app.js` |
| Drop a file on the map | Kept in your browser so it's still there next time (IndexedDB). Never uploaded. Clearing site data removes it. | `datasets.js` |
| Print | Your browser makes the PDF on your device. | `app.js`, `print()` |
| View streets in Neighborhood mode | Your browser asks this site for one map square (about 2 km across) of street data. This site asks OpenStreetMap's Overpass service for that square on your behalf. See below. | `osm.js` |

## Street data (Neighborhood mode)

Street maps come from [OpenStreetMap](https://www.openstreetmap.org/copyright) through two public Overpass servers: `overpass-api.de`, the main one, and `overpass.private.coffee`, which is only asked if the first is slow or busy. Your browser never talks to either:

1. **Only this site is contacted.** Your browser asks `/osm/14/<x>/<y>.json` (and `-buildings.json` when building outlines are shown) on this site. (`worker.js`)
2. **The request to OpenStreetMap is built from scratch.** None of your browser's headers go with it: no IP address, cookies, browser name or the page you came from. Overpass sees Cloudflare's address and our name, never yours. (`osm.js`, `ask()`. `scripts/privacy.mjs` sends a request full of identifying headers through it and fails if any of them reach Overpass.)
3. **Only whole map squares on a fixed grid can be asked for.** A request names a square roughly 2 km across, the same squares for everyone, never a point or an address. Anything else is refused. (`osm.js`, `tileFromUrl()`)
4. **The question sent to Overpass is fixed.** It always asks for streets, water, parks and schools in that square, or its buildings. A visitor can't change it. (`osm.js`, `query()`)
5. **Addresses are thrown away.** Each shape keeps only what kind it is (road, park, building…) and, for streets and public places, its name. House numbers, addresses, phone numbers, building names and all other details are dropped before anything reaches your browser. (`osm.js`, `toGeoJSON()`)
6. **Squares are shared.** Once anyone has viewed a square, Cloudflare keeps a copy for a month and serves that to everyone, so most views never reach OpenStreetMap at all. The copy is stored under the square's number only.
7. **Nothing is logged.** The Worker never writes logs, and Workers Logs and Logpush are switched off. (`wrangler.jsonc`. `scripts/privacy.mjs` fails if either is turned on or a `console` call appears.)

## What we can't promise from code alone

- **Cloudflare hosts the site.** Like any web host, it receives each request (IP address, page, browser) to deliver it. See [Cloudflare's privacy policy](https://www.cloudflare.com/privacypolicy/).
- **Traffic numbers.** We count visits with Cloudflare's own traffic statistics, which are gathered at the server and add no script to the page. Cloudflare's optional Web Analytics script is a dashboard setting, not code, so the build can't check it. We keep it off, and if that ever changes, this page will say so.

## Map data

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License. World and US outlines come from Natural Earth and the US Census Bureau (public domain).
