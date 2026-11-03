import { Hono } from 'hono';
import { briefFor } from '../app/brief.ts';
import { listCollectionViews } from '../app/collections.ts';
import { listEvents } from '../app/events.ts';
import { createItem, type ListItemsFilter, listItems, moveItem, showItem } from '../app/items.ts';
import { listAgents, presenceSignature } from '../app/presence.ts';
import { listPresetViews } from '../app/preset-views.ts';
import { type Project, projectView } from '../app/project.ts';
import { linkItems, unlinkItems } from '../app/relations.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import type { EventFilter } from '../store/queries.ts';
import { type ChangeFeed, createChangeFeed } from './changes.ts';
import { errorBody, ForbiddenHost, InvalidQuery, toErrorResponse } from './errors.ts';
import { serveEvidence } from './evidence.ts';
import { DEFAULT_PORT, isAllowedHost } from './hosts.ts';
import { mountAuth, type Session, session } from './session.ts';
import { type LiveStreams, liveStreams } from './stream.ts';
import { studioApi } from './studio.ts';
import { BUILT_UI_DIR, mountUi } from './ui.ts';
import {
  assertSignedIn,
  assertWritable,
  briefRequest,
  createRequest,
  HUMAN_IN_UI,
  linkRequest,
  moveRequest,
} from './writes.ts';

export type OteaServer = { app: Hono; listeningOn(port: number): void; close(): void };

export type ServerOptions = { pollIntervalMs?: number; uiDir?: string; token?: string };

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

function api(project: Project, feed: ChangeFeed, streams: LiveStreams, auth: Session): Hono {
  return new Hono()
    .get('/session', (c) => c.json({ canWrite: auth.canWrite(c) }))
    .get('/project', (c) => c.json(projectView(project)))
    .get('/collections', (c) => c.json(listCollectionViews(project)))
    .get('/presets', (c) => c.json(listPresetViews(project)))
    .get('/agents', (c) => c.json({ agents: listAgents(project.db) }))
    .get('/items', (c) =>
      c.json(listItems(project, itemsFilter(c.req.query(), c.req.queries('field')))),
    )
    .post('/items', async (c) => {
      assertWritable(c, auth);
      const request = await createRequest(c);
      const item = createItem(project, { ...request, ...HUMAN_IN_UI });
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
      const relation = unlinkItems(project, { id: c.req.param('id'), ...request, ...HUMAN_IN_UI });
      feed.notify();
      return c.json(relation);
    })
    .post('/brief', async (c) => c.json(briefFor(project, await briefRequest(c))))
    .get('/evidence/:id/file', (c) => {
      assertSignedIn(c, auth, 'open evidence files');
      return serveEvidence(c, project, c.req.param('id'));
    })
    .route('/studio', studioApi(project, feed, auth))
    .get('/events', (c) => c.json(listEvents(project, eventsFilter(c.req.query()))))
    .get('/stream', (c) => streams.handle(c))
    .all('*', (c) => c.json(errorBody('not_found', `No route ${c.req.path}`), 404));
}

export function createServer(project: Project, options: ServerOptions = {}): OteaServer {
  const feed = createChangeFeed(project.db, options.pollIntervalMs);
  const streams = liveStreams(feed, () => presenceSignature(project.db));
  let port = DEFAULT_PORT;
  const app = new Hono();
  app.use(async (c, next) => {
    const host = c.req.header('host');
    if (!isAllowedHost(host, port)) throw new ForbiddenHost(`Host "${host ?? ''}" is not allowed`);
    await next();
  });
  const boundPort = () => port;
  mountAuth(app, options.token, boundPort);
  app.route('/api', api(project, feed, streams, session(options.token, boundPort)));
  mountUi(app, options.uiDir ?? BUILT_UI_DIR);
  app.onError((error, c) => {
    const { status, body } = toErrorResponse(error);
    return c.json(body, status);
  });
  return {
    app,
    listeningOn(listened) {
      port = listened;
    },
    close() {
      streams.closeAll();
      feed.close();
    },
  };
}
