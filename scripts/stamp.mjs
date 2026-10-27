#!/usr/bin/env node
/* Stamp asset URLs with ?v=<content hash> so they can be cached for a year.

   Run by the Workers Builds build command on the deploy checkout only:  node scripts/stamp.mjs --write
   Without --write it stamps in memory and reports what it would change, so it is safe to run locally.

   - fonts/, vendor/ and data/ files, plus app.js and datasets.js, get ?v=<first 10 hex of sha256>.
   - Literal references are rewritten in index.html, _headers (Early Hints), app.js and datasets.js (the module imports)
     and sw.js (the files it caches for offline use).
   - Paths built at runtime (data/${name}.json) go through asset() in app.js, which reads window.ASSET_V, the data/
     manifest injected into index.html here.
   - _headers switches those paths to `max-age=31536000, immutable`. That is only safe if every reference carries a
     version, so the run fails if any unstamped reference is left. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const write = process.argv.includes('--write');
const read = (p) => readFileSync(join(root, p), 'utf8');
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

const files = { 'index.html': read('index.html'), '_headers': read('_headers'), 'app.js': read('app.js'), 'datasets.js': read('datasets.js'), 'sw.js': read('sw.js') };
const v = {};
for (const dir of ['fonts', 'vendor', 'data']) {
  for (const f of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (f.isFile() && /\.(js|css|json|woff2)$/.test(f.name)) v[`${dir}/${f.name}`] = hash(readFileSync(join(root, dir, f.name)));
  }
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* rewrite every literal occurrence of a known path (bare, ./ or / prefixed) that is not already versioned */
const stampRefs = (text, paths) => {
  for (const p of paths) text = text.replace(new RegExp(`(["'(<]|\\s)(\\.?/)?${esc(p)}(?![\\w.?/-])`, 'g'), (_, pre, slash = '') => `${pre}${slash}${p}?v=${v[p]}`);
  return text;
};
const leaves = Object.keys(v);
/* the modules import vendor files, so stamp them first: their own hash has to cover the stamped import */
for (const m of ['app.js', 'datasets.js']) { files[m] = stampRefs(files[m], leaves); v[m] = hash(files[m]); }
const all = Object.keys(v);
files['sw.js'] = stampRefs(files['sw.js'], all);
files['index.html'] = stampRefs(files['index.html'], all)
  .replace(/<script>window\.ASSET_V=.*?<\/script>\n/, '')
  .replace('</head>', `<script>window.ASSET_V=${JSON.stringify(Object.fromEntries(leaves.filter((p) => p.startsWith('data/')).map((p) => [p, v[p]])))}</script>\n</head>`);
files['_headers'] = files['_headers'].split('\n').map((l) => (/^\s+Link:/.test(l) ? stampRefs(l, all) : l)).join('\n') /* only the Early Hints */
  .replace(/^(\/(?:fonts|vendor|data)\/\*\n  Cache-Control: ).*$/gm, '$1public, max-age=31536000, immutable')
  .replace(/\n\/app\.js\n.*\n\/datasets\.js\n.*\n/, '\n')
  .replace(/\n(?=# Early Hints)/, '\n/app.js\n  Cache-Control: public, max-age=31536000, immutable\n/datasets.js\n  Cache-Control: public, max-age=31536000, immutable\n');

/* every remaining reference to a cached path must carry ?v=, or a browser could keep a stale copy for a year */
const bad = [];
const ref = /(?<![\w/])(?:\.?\/)?((?:fonts|vendor|data)\/[\w.-]+\.(?:js|css|json|woff2)|app\.js|datasets\.js)(?![\w?-])/g;
/* blank out comments (keeping line breaks) so prose that mentions a file doesn't count */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (name, t) => name === '_headers' ? t.replace(/^#.*$/gm, '').replace(/^\/[\w*/.-]+$/gm, '')
  : t.replace(/<script>window\.ASSET_V=.*?<\/script>/, blank).replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank).replace(/(^|[\s;{}(])\/\/.*$/gm, (m, pre) => pre + blank(m.slice(pre.length)));
for (const [name, text] of Object.entries(files)) {
  strip(name, text).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(ref)) if (!/asset\(\s*['"`]$/.test(line.slice(0, m.index))) bad.push(`${name}:${i + 1}: ${m[0]}`);
  });
}
if (bad.length) { console.error('unversioned asset references:\n  ' + bad.join('\n  ')); process.exit(1); }

let changed = 0;
for (const [name, text] of Object.entries(files)) {
  if (text === read(name)) continue;
  changed++;
  if (write) writeFileSync(join(root, name), text);
}
console.log(`${write ? 'stamped' : 'would stamp'} ${changed} files, ${all.length} assets versioned`);
