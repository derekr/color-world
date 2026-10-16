#!/usr/bin/env node
/* Build a translated copy of index.html for each locales/<lang>.json, at <dir>/index.html (not committed).

   Runs as wrangler's custom build (wrangler.jsonc), so on deploys it runs after scripts/stamp.mjs and copies the
   stamped page. The Worker (worker.js) serves <dir>/ and maps <dir>/<asset> back to /<asset>, so the copy keeps
   index.html's relative URLs.

   A locale file has:
   - lang, dir, url: the page's <html lang>, its folder, and its canonical URL (also the language picker's value).
   - html: English → translated, for whole text nodes and whole attribute values in index.html.
   - replace: exact snippets of index.html → their translation, for English inside Datastar expressions.
   - js: English → translated, for strings app.js and datasets.js pass through i18n(); injected as window.I18N.
   - names: place names, keyed like app.js keys places (c:<iso> for countries, the English name for US states);
     injected as window.PLACE_NAMES. Countries and states come from Natural Earth's name_<lang> columns.
   Anything left out stays English. The build fails if a key no longer matches anything, so edits to the English
   text can't silently drop a translation, or if the locale is missing from _headers, wrangler.jsonc or worker.js. */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const page = read('index.html');
const js = read('app.js') + read('datasets.js');
const headers = read('_headers'), wrangler = read('wrangler.jsonc'), worker = read('worker.js');
const linksFor = (path) => (headers.match(new RegExp(`^${esc(path)}\\n((?:  .*\\n?)*)`, 'm')) || [])[1]?.trim();
const errors = [], outputs = [];

for (const file of readdirSync(join(root, 'locales')).filter((f) => f.endsWith('.json'))) {
  const loc = JSON.parse(read(`locales/${file}`));
  let out = page;
  for (const [en, tr] of Object.entries(loc.replace || {})) {
    if (!out.includes(en)) errors.push(`${file}: replace "${en}" is not in index.html`);
    out = out.split(en).join(tr);
  }
  for (const [en, tr] of Object.entries(loc.html || {})) {
    let n = 0;
    out = out
      .replace(new RegExp(`(>\\s*)${esc(en)}(\\s*<)`, 'g'), (_, a, b) => (n++, a + tr.replace(/</g, '&lt;') + b))
      .replace(new RegExp(`(=")${esc(attr(en))}(")`, 'g'), (_, a, b) => (n++, a + attr(tr) + b));
    if (!n) errors.push(`${file}: html "${en}" is not in index.html`);
  }
  /* a js key has to be a string literal somewhere (i18n('…') itself, or a list whose items go through i18n()) */
  for (const en of Object.keys(loc.js || {})) {
    if (!['"', "'", '`'].some((q) => js.includes(q + en + q))) errors.push(`${file}: js "${en}" is not a string in app.js or datasets.js`);
  }
  if (linksFor(`/${loc.dir}/`) !== linksFor('/')) errors.push(`_headers: the Early Hints for /${loc.dir}/ must match the ones for /`);
  if (!wrangler.includes(`"/${loc.dir}/*"`)) errors.push(`wrangler.jsonc: run_worker_first needs "/${loc.dir}" and "/${loc.dir}/*"`);
  if (!worker.includes(`'${loc.dir}'`)) errors.push(`worker.js: DIRS needs '${loc.dir}'`);
  if (!out.includes(`<option value="${loc.url}"`)) errors.push(`index.html: the language picker has no option for ${loc.url}`);
  out = out
    .replace(/<html lang="[^"]*"/, `<html lang="${loc.lang}"`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${loc.url}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${loc.url}`)
    .replace(/(<option value="[^"]*") selected>/, '$1>')
    .replace(`<option value="${loc.url}">`, `<option value="${loc.url}" selected>`)
    .replace('</head>', `<script>window.I18N=${json(loc.js || {})};window.PLACE_NAMES=${json(loc.names || {})}</script>\n</head>`);
  outputs.push([loc, out]);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
for (const [loc, out] of outputs) {
  mkdirSync(join(root, loc.dir), { recursive: true });
  writeFileSync(join(root, loc.dir, 'index.html'), out);
  console.log(`built ${loc.dir}/index.html (${loc.lang})`);
}
