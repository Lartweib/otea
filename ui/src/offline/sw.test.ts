import { describe, expect, it, vi } from 'vitest';
import { FROM_CACHE, PROJECT, SAVED_AT, swRoute } from './sw-routes.ts';
import {
  type CacheLike,
  cacheFirst,
  DATA_CACHE,
  dataCacheFor,
  homeFirst,
  LAST_PROJECT,
  networkFirst,
  rememberProject,
  shellCache,
  staleCaches,
  unreachable,
} from './sw-strategies.ts';

const ORIGIN = 'https://desk.tail1234.ts.net';
const PRECACHED = new Set(['/index.html', '/assets/index-abc.js', '/icons/otea-192.png']);

const route = (path: string, o: { method?: string; mode?: string; origin?: string } = {}) =>
  swRoute(
    { method: o.method ?? 'GET', url: `${o.origin ?? ORIGIN}${path}`, mode: o.mode ?? 'cors' },
    ORIGIN,
    PRECACHED,
  );

describe('swRoute', () => {
  it("opens every project's page and the pairing screen from the cached app", () => {
    expect(route('/p/web-k3x7qa/', { mode: 'navigate' })).toBe('shell');
    expect(route('/p/web-k3x7qa/index.html', { mode: 'navigate' })).toBe('shell');
    expect(route('/pair', { mode: 'navigate' })).toBe('shell');
  });

  // P3C-1: a sign-in served from the cache sets no cookie, and every write is refused after.
  it('leaves the sign-in link to the PC', () => {
    expect(route('/auth?token=abc&next=%2Fp%2Fweb-k3x7qa%2F', { mode: 'navigate' })).toBe(
      'network',
    );
  });

  // The home-screen shortcut opens `/`: the PC sends it to the last project; without the PC the
  // cached page opens that project itself.
  it('asks the PC for the home page first, and falls back to the cached app', () => {
    expect(route('/', { mode: 'navigate' })).toBe('home');
  });

  it("reads a project's API under its path as the API", () => {
    expect(route('/p/web-k3x7qa/api/items')).toBe('data');
    expect(route('/p/web-k3x7qa/api/stream')).toBe('network');
    expect(route('/p/web-k3x7qa/api/evidence/3/file', { mode: 'navigate' })).toBe('network');
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
    keys: async () => [...map.keys()],
    delete: async (key) => map.delete(key),
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

  // TS-11: Tailscale serve answers 502 while nothing listens behind it: Otea is closed on the PC,
  // which the offline line says apart from a PC it cannot reach at all.
  it.each([
    ['does not answer', down, '1'],
    ['answers through a door with nothing behind it', async () => json({}, 502), 'closed'],
  ])('when the PC %s, answers with the last answer, marked as cached', async (_, net, why) => {
    const kept = new Response('[{"id":"A-1"}]', { headers: { [SAVED_AT]: '1700000000000' } });
    const { cache } = memoryCache({ [ITEMS]: kept });
    const response = await networkFirst(new Request(ITEMS), { net, cache, now: () => 0 });

    expect(await response.json()).toEqual([{ id: 'A-1' }]);
    expect(response.headers.get(FROM_CACHE)).toBe(why);
    expect(response.headers.get(SAVED_AT)).toBe('1700000000000');
  });

  it('marks a door with nothing behind it as Otea closed, even with nothing kept', async () => {
    const response = await networkFirst(new Request(ITEMS), {
      net: async () => json({}, 502),
      cache: memoryCache().cache,
      now: () => 0,
    });

    expect(response.status).toBe(502);
    expect(response.headers.get(FROM_CACHE)).toBe('closed');
  });

  it('gives up on a hanging PC within a few seconds by default', async () => {
    vi.useFakeTimers();
    try {
      const { cache } = memoryCache({ [ITEMS]: json([]) });
      const answer = networkFirst(new Request(ITEMS), {
        net: () => new Promise<Response>(() => undefined),
        cache,
        now: () => 0,
      });
      await vi.advanceTimersByTimeAsync(4000);
      const response = await answer;
      expect(response.headers.get(FROM_CACHE)).toBe('1');
    } finally {
      vi.useRealTimers();
    }
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

// One server serves every project, each under /p/<id>/: each keeps its own offline answers, and
// CAM-1 of one never shows as CAM-1 of another (DR3-9, P6).
describe('networkFirst, a cache per project', () => {
  const A = `${ORIGIN}/p/alpha-aaaaaa/api/items/CAM-1`;
  const B = `${ORIGIN}/p/beta-bbbbbb/api/items/CAM-1`;
  const from = (project: string, body: unknown) =>
    new Response(JSON.stringify(body), { headers: { [PROJECT]: project } });

  it('names the cache after the project in the path', () => {
    expect(dataCacheFor(A)).toBe('otea-data-alpha-aaaaaa');
    expect(dataCacheFor(B)).toBe('otea-data-beta-bbbbbb');
    expect(dataCacheFor(`${ORIGIN}/api/session`)).toBe(DATA_CACHE);
  });

  it("keeps each project's answers apart, and reads each one's offline", async () => {
    const alpha = memoryCache();
    const beta = memoryCache();
    await networkFirst(new Request(A), {
      net: async () => from('alpha-aaaaaa', { title: 'Alpha camera' }),
      cache: alpha.cache,
      now: () => 0,
    });
    await networkFirst(new Request(B), {
      net: async () => from('beta-bbbbbb', { title: 'Beta camera' }),
      cache: beta.cache,
      now: () => 0,
    });

    const offA = await networkFirst(new Request(A), {
      net: down,
      cache: alpha.cache,
      now: () => 0,
    });
    const offB = await networkFirst(new Request(B), { net: down, cache: beta.cache, now: () => 0 });
    expect(await offA.json()).toEqual({ title: 'Alpha camera' });
    expect(await offB.json()).toEqual({ title: 'Beta camera' });
  });

  it('never keeps an answer another project gave under this path', async () => {
    const { cache, map } = memoryCache();
    await networkFirst(new Request(A), {
      net: async () => from('beta-bbbbbb', { title: 'Beta camera' }),
      cache,
      now: () => 0,
    });
    expect(map.has(A)).toBe(false);
  });
});

// TS-1, TS-5: the installed app opens at `/`. A PC off the tailnet leaves that request hanging for
// minutes, so the app waits a few seconds at most, then opens the last project from the cache.
describe('homeFirst', () => {
  const HOME = `${ORIGIN}/`;
  const hanging = () => new Promise<Response>(() => undefined);
  const shell = () => memoryCache({ '/index.html': new Response('cached app') });

  it('takes the PC answer when it comes', async () => {
    const { cache } = shell();
    const response = await homeFirst(new Request(HOME), {
      net: async () => new Response('from the PC'),
      shell: cache,
      data: memoryCache().cache,
    });

    expect(await response.text()).toBe('from the PC');
  });

  it('opens the last project from the cache when the PC hangs', async () => {
    const data = memoryCache({ [LAST_PROJECT]: new Response('web-k3x7qa') });
    const response = await homeFirst(new Request(HOME), {
      net: hanging,
      shell: shell().cache,
      data: data.cache,
      waitMs: 5,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/p/web-k3x7qa/`);
  });

  it('opens the cached app when no project was opened yet', async () => {
    const response = await homeFirst(new Request(HOME), {
      net: down,
      shell: shell().cache,
      data: memoryCache().cache,
    });

    expect(await response.text()).toBe('cached app');
  });

  it('counts a door with nothing behind it as the PC being off', async () => {
    const data = memoryCache({ [LAST_PROJECT]: new Response('web-k3x7qa') });
    const response = await homeFirst(new Request(HOME), {
      net: async () => json({}, 502),
      shell: shell().cache,
      data: data.cache,
    });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/p/web-k3x7qa/`);
  });

  it("keeps the project of each project's page as the last one", async () => {
    const { cache, map } = memoryCache();
    await rememberProject(`${ORIGIN}/p/web-k3x7qa/`, cache);
    await rememberProject(`${ORIGIN}/pair`, cache);

    expect(await map.get(LAST_PROJECT)?.text()).toBe('web-k3x7qa');
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
  it("drops the shell caches of other versions, never a project's data", () => {
    expect(
      staleCaches(
        [
          'otea-shell-old',
          shellCache('new'),
          'otea-data',
          'otea-data-alpha-aaaaaa',
          'someone-else',
        ],
        'new',
      ),
    ).toEqual(['otea-shell-old']);
  });

  it('counts no answer and a door with nothing behind it as the PC being off', () => {
    expect(unreachable(undefined)).toBe(true);
    expect(unreachable(json({}, 504))).toBe(true);
    expect(unreachable(json({}, 404))).toBe(false);
  });
});
