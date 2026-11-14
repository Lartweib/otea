import { describe, expect, it } from 'vitest';
import { FROM_CACHE, SAVED_AT, swRoute } from './sw-routes.ts';
import {
  type CacheLike,
  cacheFirst,
  networkFirst,
  shellCache,
  staleCaches,
  unreachable,
} from './sw-strategies.ts';

const ORIGIN = 'https://desk.tail1234.ts.net';
const PRECACHED = new Set(['/', '/assets/index-abc.js', '/icons/otea-192.png']);

const route = (path: string, o: { method?: string; mode?: string; origin?: string } = {}) =>
  swRoute(
    { method: o.method ?? 'GET', url: `${o.origin ?? ORIGIN}${path}`, mode: o.mode ?? 'cors' },
    ORIGIN,
    PRECACHED,
  );

describe('swRoute', () => {
  it('opens every page load from the cached app', () => {
    expect(route('/', { mode: 'navigate' })).toBe('shell');
    expect(route('/pair', { mode: 'navigate' })).toBe('shell');
  });

  it('serves the built files from the cache, and nothing else it does not know', () => {
    expect(route('/assets/index-abc.js')).toBe('static');
    expect(route('/icons/otea-192.png')).toBe('static');
    expect(route('/assets/other.js')).toBe('network');
  });

  it.each([
    '/api/items',
    '/api/items/TASKS-1',
    '/api/items/TASKS-1/notes',
    '/api/collections',
    '/api/session',
    '/api/project',
  ])('reads %s from the network first, keeping the last answer', (path) => {
    expect(route(path)).toBe('data');
  });

  it.each([
    '/api/stream',
    '/api/evidence/3/file',
    '/api/pair',
    '/api/lan',
    '/api/phone',
    '/api/notify',
  ])('leaves %s to the network', (path) => {
    expect(route(path)).toBe('network');
    // An evidence file opened in a tab is a page load, yet never the app.
    expect(route(path, { mode: 'navigate' })).toBe('network');
  });

  it('never touches a write or another origin', () => {
    expect(route('/api/items', { method: 'POST' })).toBe('network');
    expect(route('/assets/index-abc.js', { origin: 'https://cdn.example' })).toBe('network');
  });
});

function memoryCache(entries: Record<string, Response> = {}) {
  const map = new Map(Object.entries(entries));
  const cache: CacheLike = {
    match: async (key) => map.get(key)?.clone(),
    put: async (key, response) => {
      map.set(key, response);
    },
  };
  return { cache, map };
}

const ITEMS = `${ORIGIN}/api/items`;
const json = (body: unknown, status = 200) => Response.json(body, { status });
const down = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};

describe('networkFirst', () => {
  it('answers from the PC and keeps that answer, with when it came', async () => {
    const { cache, map } = memoryCache();
    const response = await networkFirst(new Request(ITEMS), {
      net: async () => json([{ id: 'A-1' }]),
      cache,
      now: () => 1_700_000_000_000,
    });

    expect(await response.json()).toEqual([{ id: 'A-1' }]);
    expect(response.headers.get(FROM_CACHE)).toBeNull();
    expect(map.get(ITEMS)?.headers.get(SAVED_AT)).toBe('1700000000000');
  });

  it.each([
    ['does not answer', down],
    ['answers through a door with nothing behind it', async () => json({}, 502)],
  ])('when the PC %s, answers with the last answer, marked as cached', async (_, net) => {
    const kept = new Response('[{"id":"A-1"}]', { headers: { [SAVED_AT]: '1700000000000' } });
    const { cache } = memoryCache({ [ITEMS]: kept });
    const response = await networkFirst(new Request(ITEMS), { net, cache, now: () => 0 });

    expect(await response.json()).toEqual([{ id: 'A-1' }]);
    expect(response.headers.get(FROM_CACHE)).toBe('1');
    expect(response.headers.get(SAVED_AT)).toBe('1700000000000');
  });

  it('counts a request left hanging as the PC being off', async () => {
    const { cache } = memoryCache({ [ITEMS]: json([]) });
    const response = await networkFirst(new Request(ITEMS), {
      net: () => new Promise<Response>(() => undefined),
      cache,
      now: () => 0,
      waitMs: 5,
    });

    expect(response.headers.get(FROM_CACHE)).toBe('1');
  });

  it('says the PC is off when nothing was kept', async () => {
    const response = await networkFirst(new Request(ITEMS), {
      net: down,
      cache: memoryCache().cache,
      now: () => 0,
    });

    expect(response.status).toBe(503);
    expect(response.headers.get(FROM_CACHE)).toBe('1');
  });

  it('passes a refusal through and keeps nothing, so a revoked phone is not shown old data', async () => {
    const { cache, map } = memoryCache({ [ITEMS]: json([{ id: 'old' }]) });
    const response = await networkFirst(new Request(ITEMS), {
      net: async () => json({ error: { code: 'unpaired' } }, 401),
      cache,
      now: () => 0,
    });

    expect(response.status).toBe(401);
    expect(await map.get(ITEMS)?.clone().json()).toEqual([{ id: 'old' }]);
  });
});

describe('cacheFirst', () => {
  it('answers from the cache without asking the network', async () => {
    const { cache } = memoryCache({ '/': new Response('cached app') });
    const response = await cacheFirst('/', `${ORIGIN}/`, { net: down, cache });

    expect(await response.text()).toBe('cached app');
  });

  it('asks the network for what it lacks, and keeps it', async () => {
    const { cache, map } = memoryCache();
    await cacheFirst('/x.js', `${ORIGIN}/x.js`, { net: async () => new Response('x'), cache });

    expect(map.has('/x.js')).toBe(true);
  });
});

describe('versions', () => {
  it('drops the shell caches of other versions, never the data', () => {
    expect(
      staleCaches(['otea-shell-old', shellCache('new'), 'otea-data', 'someone-else'], 'new'),
    ).toEqual(['otea-shell-old']);
  });

  it('counts no answer and a door with nothing behind it as the PC being off', () => {
    expect(unreachable(undefined)).toBe(true);
    expect(unreachable(json({}, 504))).toBe(true);
    expect(unreachable(json({}, 404))).toBe(false);
  });
});
