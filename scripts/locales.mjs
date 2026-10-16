#!/usr/bin/env node
/* Build a translated copy of index.html for each locales/<lang>.json, at <dir>/index.html (not committed).

   Runs as wrangler's custom build (wrangler.jsonc), so on deploys it runs after scripts/stamp.mjs and copies the
   stamped page. The Worker (worker.js) serves <dir>/ and maps <dir>/<asset> back to /<asset>, so the copy keeps
   index.html's relative URLs.

   A locale file has:
   - lang, dir, url: the page's <html lang>, its folder, and its canonical URL.
   - html: English → translated, for whole text nodes and whole attribute values in index.html.
   - js: English → translated, for strings app.js and datasets.js pass through i18n(); injected as window.I18N.
   Anything left out stays English. The build fails if a key no longer matches anything, so edits to the English
   text can't silently drop a translation, and if _headers has no Early Hints block for the locale. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const page = read('index.html');
const js = read('app.js') + read('datasets.js');
const headers = read('_headers');
const linksFor = (path) => (headers.match(new RegExp(`^${esc(path)}\\n((?:  .*\\n?)*)`, 'm')) || [])[1]?.trim();
const errors = [], outputs = [];

for (const file of readdirSync(join(root, 'locales')).filter((f) => f.endsWith('.json'))) {
  const loc = JSON.parse(read(`locales/${file}`));
  let out = page;
  for (const [en, tr] of Object.entries(loc.html || {})) {
    let n = 0;
    out = out
      .replace(new RegExp(`(>\\s*)${esc(en)}(\\s*<)`, 'g'), (_, a, b) => (n++, a + tr.replace(/</g, '&lt;') + b))
      .replace(new RegExp(`(=")${esc(attr(en))}(")`, 'g'), (_, a, b) => (n++, a + attr(tr) + b));
    if (!n) errors.push(`${file}: html "${en}" is not in index.html`);
  }
  for (const en of Object.keys(loc.js || {})) {
    if (!['"', "'", '`'].some((q) => js.includes(`i18n(${q}${en}${q})`))) errors.push(`${file}: js "${en}" is not passed to i18n() in app.js or datasets.js`);
  }
  if (linksFor(`/${loc.dir}/`) !== linksFor('/')) errors.push(`_headers: the Early Hints for /${loc.dir}/ must match the ones for /`);
  out = out
    .replace(/<html lang="[^"]*"/, `<html lang="${loc.lang}"`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${loc.url}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${loc.url}`)
    .replace('</head>', `<script>window.I18N=${JSON.stringify(loc.js || {}).replace(/</g, '\\u003c')}</script>\n</head>`);
  outputs.push([loc, out]);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
for (const [loc, out] of outputs) {
  mkdirSync(join(root, loc.dir), { recursive: true });
  writeFileSync(join(root, loc.dir, 'index.html'), out);
  console.log(`built ${loc.dir}/index.html (${loc.lang})`);
}
