/* Everything is a static asset; this only runs first for / and /en-gb/ (run_worker_first in wrangler.jsonc).
   - colour-world.perfectdays.dev serves the en-GB page (en-gb/index.html, built by scripts/locales.mjs) at /.
   - On either live host, /en-gb/ redirects there, so each page has one address.
   - Other hosts (previews, wrangler dev) serve it at /en-gb/. Its asset URLs are relative, so /en-gb/<path> is
     served from /<path>. */
const GB = 'colour-world.perfectdays.dev';
const LIVE = [GB, 'color-world.perfectdays.dev'];

export default {
  fetch(req, env) {
    const url = new URL(req.url);
    const serve = (path) => { url.pathname = path; return env.ASSETS.fetch(new Request(url, req)); };
    const gbPage = url.pathname === '/en-gb' || url.pathname === '/en-gb/';
    if (url.hostname === GB && url.pathname === '/') return serve('/en-gb/');
    if (gbPage && LIVE.includes(url.hostname)) return Response.redirect(`https://${GB}/${url.search}`, 301);
    if (url.pathname.startsWith('/en-gb/') && !gbPage) return serve(url.pathname.slice('/en-gb'.length));
    return env.ASSETS.fetch(req);
  }
};
