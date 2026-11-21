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

// What the service worker knows of the PC while it runs (TS-33): when a request last found it down,
// and the reads waiting on it meanwhile. Once one request finds it down, the reads waiting answer
// from the cache at once, and so do the next ones for a while; their requests still go on, and the
// first answer from the PC counts it as back.
export type Link = { downAt: number | null; waiting: Set<() => void> };

export const newLink = (): Link => ({ downAt: null, waiting: new Set() });

// How long a PC found down counts as down without asking again.
export const DOWN_FOR_MS = 30_000;

const isDown = (link: Link, now: number) => link.downAt !== null && now - link.downAt < DOWN_FOR_MS;

function markDown(link: Link, now: number): void {
  link.downAt = now;
  const waiting = [...link.waiting];
  link.waiting.clear();
  for (const wake of waiting) wake();
}

// Keeps a task going after the answer went (the service worker's waitUntil).
export type Background = (task: Promise<unknown>) => void;

// The PC's answer within `waitMs`, or none: a PC off the tailnet leaves a request hanging for
// minutes (TS-1), and the app must open from the cache long before that. With a link, it gives up
// at once while the PC is known to be down, or as soon as another request finds it down; `live` is
// the request itself, which goes on either way.
async function within(
  live: Promise<Response | undefined>,
  waitMs: number,
  link: Link,
  now: () => number,
): Promise<Response | undefined> {
  if (isDown(link, now())) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wake: () => void = () => undefined;
  const late = new Promise<undefined>((resolve) => {
    wake = () => resolve(undefined);
    timer = setTimeout(() => {
      markDown(link, now());
      resolve(undefined);
    }, waitMs);
  });
  link.waiting.add(wake);
  try {
    const response = await Promise.race([live, late]);
    // No answer, or the door's own: the PC is down, and the reads waiting on it need not wait.
    if (response === undefined || unreachable(response)) markDown(link, now());
    return response;
  } finally {
    clearTimeout(timer);
    link.waiting.delete(wake);
  }
}

// The request to the PC: an answer from it counts the PC as back, and `keep` runs on it, late or
// not. Finding it down is `within`'s to say, after this request had its chance to answer.
function ask(
  net: Net,
  request: Request,
  link: Link,
  keep: (response: Response) => Promise<void> = async () => undefined,
): Promise<Response | undefined> {
  return net(request).then(
    async (response) => {
      if (!unreachable(response)) {
        link.downAt = null;
        await keep(response);
      }
      return response;
    },
    () => undefined,
  );
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
    link = newLink(),
    background = () => undefined,
  }: {
    net: Net;
    cache: CacheLike;
    now: () => number;
    waitMs?: number;
    link?: Link;
    background?: Background;
  },
): Promise<Response> {
  const key = request.url;
  // A good answer is kept whenever it comes: one that comes after the cache answered still
  // updates it for the next read.
  const live = ask(net, request, link, async (response) => {
    if (response.ok && ofItsProject(key, response)) {
      await cache.put(key, withHeaders(response.clone(), { [SAVED_AT]: `${now()}` }));
    }
  });
  const response = await within(live, waitMs, link, now);
  if (response && !unreachable(response)) return response;
  if (!response) background(live);
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

// `/`, the installed app's start. With a project this app opened before, that project at once
// (the page would go there itself, main.tsx; a phone no longer paired is sent to the pairing
// screen by its first read), while the request to the PC finds out meanwhile whether it answers,
// so the project's reads answer from the cache as soon as it does not (TS-33). Without one, the PC
// within `waitMs`; else the cached app (TS-5: never an empty page outside any project).
export async function homeFirst(
  request: Request,
  {
    net,
    shell,
    data,
    waitMs = 3000,
    link = newLink(),
    now = Date.now,
    background = () => undefined,
  }: {
    net: Net;
    shell: CacheLike;
    data: CacheLike;
    waitMs?: number;
    link?: Link;
    now?: () => number;
    background?: Background;
  },
): Promise<Response> {
  const live = ask(net, request, link);
  const last = await (await data.match(LAST_PROJECT))?.text();
  if (last) {
    background(within(live, waitMs, link, now));
    return Response.redirect(new URL(`/p/${last}/`, request.url).href, 302);
  }
  const response = await within(live, waitMs, link, now);
  if (response && !unreachable(response)) return response;
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
