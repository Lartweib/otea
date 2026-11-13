// What the service worker does with each request (the installed app over HTTPS, see sw.ts). It is
// pure, so the routing is tested without a browser:
//
// - shell: a page load. The app's page, from the cache first: it opens with the PC off, and a new
//   version, installed in the background, applies on the next open.
// - static: the page's own files, listed when it was built (precached). Cache first.
// - data: what the read views show. The network first; when the PC does not answer, the last
//   answer that came back, marked as such (see offline headers below).
// - network: everything else, untouched: writes, the live stream, evidence files, pairing and the
//   phone settings, other origins.

export type SwRoute = 'shell' | 'static' | 'data' | 'network';

export type SwRequest = { method: string; url: string; mode: string };

// Read live or not at all: the stream, the files, and what belongs to this computer's browser.
const LIVE_ONLY = ['/api/stream', '/api/evidence/', '/api/pair', '/api/lan', '/api/phone'];

export function swRoute(
  request: SwRequest,
  origin: string,
  precached: ReadonlySet<string>,
): SwRoute {
  if (request.method !== 'GET') return 'network';
  const url = new URL(request.url);
  if (url.origin !== origin) return 'network';
  const path = url.pathname;
  if (path === '/api' || path.startsWith('/api/')) {
    return LIVE_ONLY.some((live) => path === live || path.startsWith(live)) ? 'network' : 'data';
  }
  if (request.mode === 'navigate') return 'shell';
  return precached.has(path) ? 'static' : 'network';
}

// The page itself, as the cache keeps it: every page load opens it.
export const SHELL_KEY = '/';

// Set on a data answer the cache kept: when it came from the PC (ms since the epoch)…
export const SAVED_AT = 'x-otea-saved-at';
// …and on one served from the cache because the PC did not answer.
export const FROM_CACHE = 'x-otea-offline';
