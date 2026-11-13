import { FROM_CACHE, SAVED_AT } from './sw-routes.ts';

// How the service worker answers each route (sw-routes.ts), over the few calls of the Cache API it
// needs, so the tests give it a map and a fake network.

export type CacheLike = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
};

export type Net = (request: Request | string) => Promise<Response>;

// The PC is off or Otea is not running behind its door: no answer at all, or the door's own
// (Tailscale serve answers 502 while nothing listens behind it).
export function unreachable(response: Response | undefined): boolean {
  return response === undefined || [502, 503, 504].includes(response.status);
}

function withHeaders(response: Response, extra: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// The read views' data: the PC's answer, kept as the last good one; when the PC does not answer,
// that last one, marked as coming from the cache. A refusal (401 unpaired, 404) goes through as
// it came and keeps nothing.
// A PC that is off behind Tailscale may leave a request hanging: past `waitMs` it counts as off.
export async function networkFirst(
  request: Request,
  {
    net,
    cache,
    now,
    waitMs = 6000,
  }: { net: Net; cache: CacheLike; now: () => number; waitMs?: number },
): Promise<Response> {
  const key = request.url;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), waitMs);
  });
  let response: Response | undefined;
  try {
    response = await Promise.race([net(request), late]);
  } catch {
    response = undefined;
  } finally {
    clearTimeout(timer);
  }
  if (response && !unreachable(response)) {
    if (response.ok)
      await cache.put(key, withHeaders(response.clone(), { [SAVED_AT]: `${now()}` }));
    return response;
  }
  const kept = await cache.match(key);
  if (kept) return withHeaders(kept, { [FROM_CACHE]: '1' });
  if (response) return response;
  return Response.json(
    { error: { code: 'offline', message: 'Your PC does not answer' } },
    { status: 503, headers: { [FROM_CACHE]: '1' } },
  );
}

// The page and its files: the cached copy, else the network's (kept when it is good).
export async function cacheFirst(
  key: string,
  request: Request | string,
  { net, cache }: { net: Net; cache: CacheLike },
): Promise<Response> {
  const kept = await cache.match(key);
  if (kept) return kept;
  const response = await net(request);
  if (response.ok) await cache.put(key, response.clone());
  return response;
}

// The cache a version of the app keeps its files in: a new version fills its own, and the old ones
// go once it takes over.
export const SHELL_CACHE = 'otea-shell-';
export const DATA_CACHE = 'otea-data';

export const shellCache = (version: string) => `${SHELL_CACHE}${version}`;

export function staleCaches(names: readonly string[], version: string): string[] {
  return names.filter((name) => name.startsWith(SHELL_CACHE) && name !== shellCache(version));
}
