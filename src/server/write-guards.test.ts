import { afterAll, describe, expect, it } from 'vitest';
import { createServer } from './server.ts';
import { LOCAL_HOST, memoryProject, SESSION_COOKIE, TOKEN } from './testing.ts';

// Every write is guarded inside its own route (writes.ts: assertWritable, assertConfigurable;
// pairing.ts: assertCanManageDevices), not by a middleware, so a route that forgets its guard takes
// a write from anyone. These tests walk the routes the router holds, the machine's at /api and a
// project's at /p/<id>/api, so a route added later is walked too.

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// POSTs that write nothing: they work out an answer from what they are sent, as a GET would.
const READS = ['/api/brief', '/api/boards/:id/publish/plan'];

// Where a device that is not paired yet pairs: it has no session to send. Its codes and attempt
// limit guard it (pairing.test.ts).
const PAIRING = ['/api/pair', '/api/pair/peek'];

type Route = { method: string; path: string };

const project = memoryProject();
const server = createServer(project, { token: TOKEN });
const base = `/p/${project.identity.id}`;
const projectRoutes = server.routesOf(project.identity.id);

// A route with several handlers (a body limit, then the route) is listed once per handler.
const writes = (routes: Route[], skip: string[]): Route[] => [
  ...new Map(
    routes
      .filter(({ method, path }) => WRITES.has(method) && !skip.includes(path))
      .map(({ method, path }) => [`${method} ${path}`, { method, path }]),
  ).values(),
];

const ROUTES = [
  ...writes(server.app.routes, PAIRING),
  ...writes(
    projectRoutes,
    READS.map((path) => `${base}${path}`),
  ),
];

afterAll(() => {
  server.close();
  project.db.close();
});

// From this computer, as the UI sends a write; any value stands for a path parameter, since a
// guard refuses before anything is read.
const send = ({ method, path }: Route, headers: Record<string, string>) =>
  Promise.resolve(
    server.app.request(
      path.replace(/:[A-Za-z]+/g, '1'),
      {
        method,
        headers: { host: LOCAL_HOST, 'content-type': 'application/json', ...headers },
        body: '{}',
      },
      { incoming: { socket: { remoteAddress: '127.0.0.1' } } },
    ),
  );

const refusal = async (response: Response) => ({
  status: response.status,
  ...((await response.json()) as { error: { code: string; message: string } }).error,
});

describe('the write routes the router holds', () => {
  it('include the item writes, the boards and the machine’s', () => {
    const said = ROUTES.map(({ method, path }) => `${method} ${path.replace(base, '')}`);

    expect(said).toEqual(
      expect.arrayContaining([
        'POST /api/items',
        'POST /api/items/:id/move',
        'POST /api/items/:id/notes',
        'POST /api/items/:id/notes/:note/edit',
        'POST /api/items/:id/notes/:note/withdraw',
        'POST /api/items/:id/answer',
        'POST /api/items/:id/opened',
        'POST /api/order',
        'POST /api/pin',
        'POST /api/items/:id/update',
        'POST /api/items/:id/resume',
        'POST /api/items/:id/undo',
        'POST /api/topics/:id/notes',
        'PUT /api/boards/:id/draft',
        'DELETE /api/boards/:id',
        'POST /api/notify/prefs',
        'POST /api/lan/code',
        'POST /api/devices/:id/revoke',
      ]),
    );
  });

  it('leave out only reads that are still routes there', () => {
    const paths = projectRoutes.map(({ path }) => path);

    for (const read of READS) expect(paths).toContain(`${base}${read}`);
  });
});

describe.each(ROUTES)('$method $path', (route) => {
  it('refuses a request with no session, naming otea open', async () => {
    const refused = await refusal(await send(route, { origin: `http://${LOCAL_HOST}` }));

    expect([401, 403]).toContain(refused.status);
    expect(refused.message).toContain('otea open');
  });

  it('refuses a signed-in request from another origin', async () => {
    const response = await send(route, { origin: 'http://evil.example', cookie: SESSION_COOKIE });

    expect(await refusal(response)).toMatchObject({ status: 403, code: 'forbidden_origin' });
  });
});
