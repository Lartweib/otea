import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie } from 'hono/cookie';
import { syncBoardPresets } from '../app/boards.ts';
import { briefFor } from '../app/brief.ts';
import { listCollectionViews } from '../app/collections.ts';
import { deviceByToken, touchDevice } from '../app/devices.ts';
import { listEvents } from '../app/events.ts';
import { createItemWithEvidence } from '../app/intake.ts';
import {
  createItem,
  type ListItemsFilter,
  listItems,
  moveItem,
  showItem,
  updateItem,
} from '../app/items.ts';
import { boardRoundOf, liveBoards } from '../app/next.ts';
import { listAgents, presenceSignature } from '../app/presence.ts';
import { listPresetViews } from '../app/preset-views.ts';
import { type Env, type Project, projectView } from '../app/project.ts';
import { linkItems, unlinkItems } from '../app/relations.ts';
import { reassignItem, restartItem, undoRelease } from '../app/restart.ts';
import { undoMove } from '../app/undo.ts';
import { MAX_EVIDENCE_MB } from '../core/evidence.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import type { EventFilter } from '../store/queries.ts';
import { boardsApi } from './boards.ts';
import { type ChangeFeed, createChangeFeed } from './changes.ts';
import {
  errorBody,
  ForbiddenHost,
  InvalidQuery,
  RejectedRequest,
  toErrorResponse,
} from './errors.ts';
import { serveEvidence } from './evidence.ts';
import { DEFAULT_PORT, isAllowedHost } from './hosts.ts';
import {
  AttemptLimiter,
  type Clock,
  isLoopback,
  isPrivateAddress,
  PairingCodes,
  plainAddress,
} from './lan.ts';
import {
  assertCanManageDevices,
  assertLanOn,
  type Lan,
  lanView,
  pair,
  peekPairing,
  revoke,
} from './pairing.ts';
import { addPath, forgetPath, projectOverviews, projectSettings, relinkPath } from './projects.ts';
import {
  type Client,
  deviceCookie,
  mountAuth,
  type OteaEnv,
  type Port,
  type Session,
  session,
} from './session.ts';
import { type LiveStreams, liveStreams } from './stream.ts';
import { BUILT_UI_DIR, mountUi } from './ui.ts';
import {
  assertConfigurable,
  assertSameOrigin,
  assertSignedIn,
  assertWritable,
  briefRequest,
  createRequest,
  HUMAN_IN_UI,
  linkRequest,
  MAX_CREATE_BYTES,
  MAX_INTAKE_FILES,
  moveRequest,
  pathRequest,
  reassignRequest,
  relinkRequest,
  undoRequest,
  updateRequest,
} from './writes.ts';

export type OteaServer = {
  app: Hono<OteaEnv>;
  // Present when the server was started with LAN access (otea serve --lan).
  lan: Lan | undefined;
  listeningOn(port: number): void;
  close(): void;
};

export type ServerOptions = {
  pollIntervalMs?: number;
  uiDir?: string;
  token?: string;
  // LAN access, off unless given: the addresses of this computer a paired device may reach it at,
  // and the names (its mDNS `<hostname>.local`) that resolve to one of them.
  lan?: { addresses: string[]; names?: string[] };
  now?: Clock;
  // Where the registry of the other projects is found (OTEA_HOME).
  env?: Env;
};

function isTurn(value: string): value is Turn {
  return (TURNS as readonly string[]).includes(value);
}

// `field=key=value`, repeatable, keeps the items whose field holds exactly that value.
function fieldsFilter(pairs: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const pair of pairs) {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new InvalidQuery(`field expects key=value, got "${pair}"`);
    const key = pair.slice(0, separator);
    if (key in fields) throw new InvalidQuery(`field "${key}" given twice`);
    fields[key] = pair.slice(separator + 1);
  }
  return fields;
}

function itemsFilter(query: Record<string, string>, fields: string[] = []): ListItemsFilter {
  const { collection, state, type, turn, parent } = query;
  const filter: ListItemsFilter = {};
  if (collection !== undefined) filter.collection = collection;
  if (parent !== undefined) filter.parent = parent;
  if (state !== undefined) filter.state = state;
  if (type !== undefined) filter.type = type;
  if (turn !== undefined) {
    if (!isTurn(turn)) throw new InvalidQuery(`turn must be one of ${TURNS.join(', ')}`);
    filter.turn = turn;
  }
  if (fields.length > 0) filter.fields = fieldsFilter(fields);
  return filter;
}

// A cursor (`since`, from 0) or a count (`limit`, `latest`, from 1), as a whole number.
function wholeNumber(name: string, text: string | undefined, min: number): number | undefined {
  if (text === undefined) return undefined;
  const value = Number(text);
  if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(value) || value < min) {
    throw new InvalidQuery(`${name} must be a whole number of at least ${min}`);
  }
  return value;
}

// The same filter `otea events` reads, plus `latest`: the newest events, where a live feed starts.
function eventsFilter(query: Record<string, string>): EventFilter {
  const { item, collection } = query;
  const since = wholeNumber('since', query.since, 0);
  const limit = wholeNumber('limit', query.limit, 1);
  const latest = wholeNumber('latest', query.latest, 1);
  if (limit !== undefined && latest !== undefined) {
    throw new InvalidQuery('limit and latest cannot be combined');
  }
  return {
    ...(item === undefined ? {} : { item }),
    ...(collection === undefined ? {} : { collection }),
    ...(since === undefined ? {} : { since }),
    ...(limit === undefined ? {} : { limit }),
    ...(latest === undefined ? {} : { latest }),
  };
}

function tooLarge(): never {
  throw new RejectedRequest(
    413,
    'evidence_too_large',
    `Send at most ${MAX_INTAKE_FILES} files of ${MAX_EVIDENCE_MB} MB each`,
  );
}

type Doors = { auth: Session; lan: Lan | undefined; port: Port; env: Env };

function api(
  project: Project,
  feed: ChangeFeed,
  streams: LiveStreams,
  doors: Doors,
): Hono<OteaEnv> {
  const { auth, lan, port, env } = doors;
  return (
    new Hono<OteaEnv>()
      // A board published from another process (the CLI, another server) joins the catalog before
      // anything reads items; it costs one query when nothing was published.
      .use(async (_c, next) => {
        syncBoardPresets(project);
        await next();
      })
      .get('/session', (c) =>
        c.json({
          canWrite: auth.canWrite(c),
          canManageDevices: auth.canManageDevices(c),
          canConfigure: auth.canConfigure(c),
        }),
      )
      .post('/pair/peek', async (c) => c.json(await peekPairing(c, project, lan)))
      .post('/pair', async (c) => {
        const paired = await pair(c, project, lan, port);
        feed.notify();
        return c.json(paired, 201);
      })
      .get('/lan', (c) => {
        assertCanManageDevices(c, auth);
        return c.json(lanView(project, lan, port(), c.req.query('address')));
      })
      .post('/lan/code', (c) => {
        assertCanManageDevices(c, auth);
        assertSameOrigin(c);
        assertLanOn(lan).codes.issue();
        return c.json(lanView(project, lan, port(), c.req.query('address')), 201);
      })
      .post('/devices/:id/revoke', (c) => {
        assertCanManageDevices(c, auth);
        assertSameOrigin(c);
        const device = revoke(project, c.req.param('id'));
        feed.notify();
        return c.json(device);
      })
      .get('/project', (c) => c.json(projectView(project)))
      .get('/projects', (c) => c.json(projectOverviews(project, env)))
      .get('/project/settings', (c) => c.json(projectSettings(project, env)))
      .post('/project/paths', async (c) => {
        assertConfigurable(c, auth);
        const { path } = await pathRequest(c);
        return c.json(addPath(project, path, env), 201);
      })
      .post('/project/paths/relink', async (c) => {
        assertConfigurable(c, auth);
        const { from, to, force } = await relinkRequest(c);
        return c.json(relinkPath(project, from, to, force, env));
      })
      .post('/project/paths/forget', async (c) => {
        assertConfigurable(c, auth);
        const { path } = await pathRequest(c);
        return c.json(forgetPath(project, path, env));
      })
      .get('/collections', (c) => c.json(listCollectionViews(project)))
      .get('/presets', (c) => c.json(listPresetViews(project)))
      .get('/agents', (c) => c.json({ agents: listAgents(project.db) }))
      .get('/items', (c) => {
        const items = listItems(project, itemsFilter(c.req.query(), c.req.queries('field')));
        // On a board, each item's round as the engine counts it, so every list agrees with it.
        const boards = liveBoards(project);
        return c.json(
          items.map((item) => {
            const round = boardRoundOf(project, item, boards);
            return round === undefined ? item : { ...item, round };
          }),
        );
      })
      .post('/items', bodyLimit({ maxSize: MAX_CREATE_BYTES, onError: tooLarge }), async (c) => {
        assertWritable(c, auth, true);
        const { files, ...request } = await createRequest(c);
        const input = { ...request, ...HUMAN_IN_UI };
        const item =
          files.length === 0
            ? createItem(project, input)
            : createItemWithEvidence(project, input, files);
        feed.notify();
        return c.json(item, 201);
      })
      .get('/items/:id', (c) => c.json(showItem(project, c.req.param('id'), HUMAN_IN_UI)))
      .post('/items/:id/move', async (c) => {
        assertWritable(c, auth);
        const request = await moveRequest(c);
        const item = moveItem(project, { id: c.req.param('id'), ...request, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/update', async (c) => {
        assertWritable(c, auth);
        const { fields } = await updateRequest(c);
        const item = updateItem(project, {
          id: c.req.param('id'),
          fields,
          actor: HUMAN_IN_UI.actor,
        });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/undo', async (c) => {
        assertWritable(c, auth);
        const undo = await undoRequest(c);
        const id = c.req.param('id');
        const item =
          'from' in undo
            ? undoMove(project, { id, from: undo.from, ...HUMAN_IN_UI })
            : undoRelease(project, { id, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      // A stuck item: back in the queue of its step (Retomar), or left for an agent (Reasignar).
      .post('/items/:id/restart', (c) => {
        assertWritable(c, auth);
        const item = restartItem(project, { id: c.req.param('id'), ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/reassign', async (c) => {
        assertWritable(c, auth);
        const { agent } = await reassignRequest(c);
        const item = reassignItem(project, { id: c.req.param('id'), agent, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(item);
      })
      .post('/items/:id/link', async (c) => {
        assertWritable(c, auth);
        const request = await linkRequest(c);
        const relation = linkItems(project, { id: c.req.param('id'), ...request, ...HUMAN_IN_UI });
        feed.notify();
        return c.json(relation, 201);
      })
      .post('/items/:id/unlink', async (c) => {
        assertWritable(c, auth);
        const request = await linkRequest(c);
        const relation = unlinkItems(project, {
          id: c.req.param('id'),
          ...request,
          ...HUMAN_IN_UI,
        });
        feed.notify();
        return c.json(relation);
      })
      .post('/brief', async (c) => c.json(briefFor(project, await briefRequest(c))))
      .get('/evidence/:id/file', (c) => {
        assertSignedIn(c, auth, 'open evidence files');
        return serveEvidence(c, project, c.req.param('id'));
      })
      .route('/', boardsApi(project, feed, auth))
      .get('/events', (c) => c.json(listEvents(project, eventsFilter(c.req.query()))))
      .get('/stream', (c) => streams.handle(c))
      .all('*', (c) => c.json(errorBody('not_found', `No route ${c.req.path}`), 404))
  );
}

// What an unpaired device on the LAN may reach: the pairing screen, the files it loads, and the
// two pairing calls. Everything else waits for a device token.
function isPairingPath(c: Context): boolean {
  const { method, path } = c.req;
  if (method === 'POST') return path === '/api/pair' || path === '/api/pair/peek';
  if (method !== 'GET' && method !== 'HEAD') return false;
  // The home-screen manifest and icons too: a phone adds Otea to its home screen before it pairs.
  return (
    path === '/pair' ||
    path === '/manifest.webmanifest' ||
    path.startsWith('/assets/') ||
    path.startsWith('/icons/') ||
    /^\/otea-[a-z-]+\.svg$/.test(path)
  );
}

function remoteAddress(c: Context): string | undefined {
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  const address = incoming?.socket?.remoteAddress;
  return address === undefined ? undefined : plainAddress(address);
}

// Last seen is written at most once a minute per device, not on every request.
const SEEN_EVERY_MS = 60 * 1000;

export function createServer(project: Project, options: ServerOptions = {}): OteaServer {
  const feed = createChangeFeed(project.db, options.pollIntervalMs);
  const streams = liveStreams(feed, () => presenceSignature(project.db));
  const now = options.now ?? Date.now;
  const lan: Lan | undefined = options.lan && {
    hosts: [...(options.lan.names ?? []), ...options.lan.addresses],
    codes: new PairingCodes(now),
    attempts: new AttemptLimiter(now),
  };
  let port = DEFAULT_PORT;
  const app = new Hono<OteaEnv>();
  // Without LAN access the server listens on 127.0.0.1 only, and every request is this computer's.
  // With it, a request from this computer must still name localhost; one from the network must come
  // from a private address and name one of this computer's addresses or its own .local name (any
  // other DNS name is how a rebinding page gets in), and then carries a device token or reaches only
  // the pairing screen.
  const identify = (c: Context): Client => {
    const host = c.req.header('host');
    const remote = remoteAddress(c);
    if (!lan || (remote !== undefined && isLoopback(remote))) {
      if (!isAllowedHost(host, port))
        throw new ForbiddenHost(`Host "${host ?? ''}" is not allowed`);
      return { kind: 'local' };
    }
    const named = lan.hosts.some((name) => host?.toLowerCase() === `${name}:${port}`);
    if (remote === undefined || !isPrivateAddress(remote) || !named) {
      throw new ForbiddenHost(`Host "${host ?? ''}" is not allowed`);
    }
    const device = deviceByToken(project.db, getCookie(c, deviceCookie(port)) ?? '');
    if (!device) return { kind: 'unpaired', address: remote };
    const seen = device.lastSeenAt === null ? 0 : Date.parse(device.lastSeenAt);
    if (now() - seen >= SEEN_EVERY_MS) touchDevice(project.db, device.id, new Date(now()));
    return { kind: 'device', device, address: remote };
  };
  app.use(async (c, next) => {
    const client = identify(c);
    c.set('client', client);
    if (client.kind === 'unpaired' && !isPairingPath(c)) {
      if (c.req.method === 'GET' && !c.req.path.startsWith('/api/'))
        return c.redirect('/pair', 302);
      throw new RejectedRequest(
        401,
        'unpaired',
        'This device is not paired; scan the pairing code shown on the desk',
      );
    }
    await next();
  });
  const boundPort = () => port;
  mountAuth(app, options.token, boundPort);
  const doors = {
    auth: session(options.token, boundPort),
    lan,
    port: boundPort,
    env: options.env ?? process.env,
  };
  app.route('/api', api(project, feed, streams, doors));
  mountUi(app, options.uiDir ?? BUILT_UI_DIR);
  app.onError((error, c) => {
    const { status, body } = toErrorResponse(error);
    return c.json(body, status);
  });
  return {
    app,
    lan,
    listeningOn(listened) {
      port = listened;
    },
    close() {
      streams.closeAll();
      feed.close();
    },
  };
}
