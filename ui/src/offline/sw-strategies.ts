import { CLOSED, FROM_CACHE, PROJECT, SAVED_AT, SHELL_KEY } from './sw-routes.ts';

// How the service worker answers each route (sw-routes.ts), over the few calls of the Cache API it
// needs, so the tests give it a map and a fake network.

export type CacheLike = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  keys(): Promise<readonly string[]>;
  delete(key: string): Promise<boolean>;
};

// The project a URL of this server is about: /p/<id>/….
const projectOfUrl = (url: string): string | undefined =>
  /^\/p\/([^/]+)\//.exec(new URL(url).pathname)?.[1];

// An answer is kept only when the project that gave it is the one its path names, so offline one
// project's items never show under another (ids repeat across projects: CAM-1 in each).
function ofItsProject(url: string, response: Response): boolean {
  const said = response.headers.get(PROJECT);
  const path = projectOfUrl(url);
  return said === null || path === undefined || said === path;
}

export type Net = (request: Request | string) => Promise<Response>;

// The PC is off or Otea is not running behind its door: no answer at all, or the door's own
// (Tailscale serve answers 502 while nothing listens behind it).
export function unreachable(response: Response | undefined): boolean {
  return response === undefined || [502, 503, 504].includes(response.status);
}

// Why the PC did not answer, as FROM_CACHE says it (sw-routes.ts).
const whyUnreachable = (response: Response | undefined): string =>
  response?.status === 502 ? CLOSED : '1';

// The PC's answer within `waitMs`, or none: a PC off the tailnet leaves a request hanging for
// minutes (TS-1), and the app must open from the cache long before that.
async function within(net: Net, request: Request, waitMs: number): Promise<Response | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), waitMs);
  });
  try {
    return await Promise.race([net(request), late]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
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
// that last one, marked as coming from the cache and why (FROM_CACHE). A refusal (401 unpaired,
// 404) goes through as it came and keeps nothing.
// A PC that is off behind Tailscale may leave a request hanging: past `waitMs` it counts as off.
export async function networkFirst(
  request: Request,
  {
    net,
    cache,
    now,
    waitMs = 4000,
  }: { net: Net; cache: CacheLike; now: () => number; waitMs?: number },
): Promise<Response> {
  const key = request.url;
  const response = await within(net, request, waitMs);
  if (response && !unreachable(response)) {
    if (response.ok && ofItsProject(key, response)) {
      await cache.put(key, withHeaders(response.clone(), { [SAVED_AT]: `${now()}` }));
    }
    return response;
  }
  const why = whyUnreachable(response);
  const kept = await cache.match(key);
  if (kept) return withHeaders(kept, { [FROM_CACHE]: why });
  if (response) return withHeaders(response, { [FROM_CACHE]: why });
  return Response.json(
    { error: { code: 'offline', message: 'Your PC does not answer' } },
    { status: 503, headers: { [FROM_CACHE]: why } },
  );
}

// Where the service worker keeps the project last opened (in DATA_CACHE, which outlives a new
// version of the app): `/` opens it when the PC does not answer.
export const LAST_PROJECT = '/otea-last-project';

export async function rememberProject(url: string, data: CacheLike): Promise<void> {
  const project = projectOfUrl(url);
  if (project !== undefined) await data.put(LAST_PROJECT, new Response(project));
}

// `/`, the installed app's start: the PC sends it to the last project. Without the PC within
// `waitMs`, the last project this app opened, from the cache (TS-5: never an empty page outside
// any project); else the cached app, which goes there itself when the page knows it (main.tsx).
export async function homeFirst(
  request: Request,
  {
    net,
    shell,
    data,
    waitMs = 3000,
  }: { net: Net; shell: CacheLike; data: CacheLike; waitMs?: number },
): Promise<Response> {
  const response = await within(net, request, waitMs);
  if (response && !unreachable(response)) return response;
  const last = await (await data.match(LAST_PROJECT))?.text();
  if (last) return Response.redirect(new URL(`/p/${last}/`, request.url).href, 302);
  return (await shell.match(SHELL_KEY)) ?? response ?? Response.error();
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

// Each project keeps its answers in a cache of its own; the computer's own API in DATA_CACHE.
export function dataCacheFor(url: string): string {
  const project = projectOfUrl(url);
  return project === undefined ? DATA_CACHE : `${DATA_CACHE}-${project}`;
}

export const shellCache = (version: string) => `${SHELL_CACHE}${version}`;

export function staleCaches(names: readonly string[], version: string): string[] {
  return names.filter((name) => name.startsWith(SHELL_CACHE) && name !== shellCache(version));
}
