/* Everything is a static asset; this only runs first for / and the translated pages (run_worker_first in wrangler.jsonc).
   Each translated page is <dir>/index.html, built by scripts/locales.mjs; asset URLs are root-absolute, so the pages
   share one cached copy of each file. Anything else under /<dir>/ is served from /<path>, in case a stale page asks.
   - colour-world.perfectdays.dev serves the en-GB page at /.
   - On either live host, /en-gb/ redirects there, so each page has one address. */
const DIRS = ['en-gb', 'es', 'fr', 'de'];
const GB = 'colour-world.perfectdays.dev';
const LIVE = [GB, 'color-world.perfectdays.dev'];

export default {
  fetch(req, env) {
    const url = new URL(req.url);
    const serve = (path) => { url.pathname = path; return env.ASSETS.fetch(new Request(url, req)); };
    const [, dir, ...rest] = url.pathname.split('/');
    const page = DIRS.includes(dir) && rest.join('/') === '';
    if (url.hostname === GB && url.pathname === '/') return serve('/en-gb/');
    if (dir === 'en-gb' && page && LIVE.includes(url.hostname)) return Response.redirect(`https://${GB}/${url.search}`, 301);
    if (DIRS.includes(dir) && !page) return serve('/' + rest.join('/'));
    return env.ASSETS.fetch(req);
  }
};
