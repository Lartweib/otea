import { Hono } from 'hono';
import { type ListItemsFilter, listItems, moveItem, showItem } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { createChangeFeed } from './changes.ts';
import { errorBody, ForbiddenHost, InvalidQuery, toErrorResponse } from './errors.ts';
import { DEFAULT_PORT, isAllowedHost } from './hosts.ts';
import { mountAuth, type Session, session } from './session.ts';
import { type LiveStreams, liveStreams } from './stream.ts';
import { BUILT_UI_DIR, mountUi } from './ui.ts';
import { assertWritable, HUMAN_IN_UI, moveRequest } from './writes.ts';

export type OteaServer = { app: Hono; listeningOn(port: number): void; close(): void };

export type ServerOptions = { pollIntervalMs?: number; uiDir?: string; token?: string };

function isTurn(value: string): value is Turn {
  return (TURNS as readonly string[]).includes(value);
}

function itemsFilter(query: Record<string, string>): ListItemsFilter {
  const { collection, state, turn } = query;
  const filter: ListItemsFilter = {};
  if (collection !== undefined) filter.collection = collection;
  if (state !== undefined) filter.state = state;
  if (turn !== undefined) {
    if (!isTurn(turn)) throw new InvalidQuery(`turn must be one of ${TURNS.join(', ')}`);
    filter.turn = turn;
  }
  return filter;
}

function api(project: Project, streams: LiveStreams, auth: Session): Hono {
  return new Hono()
    .get('/session', (c) => c.json({ canWrite: auth.canWrite(c) }))
    .get('/items', (c) => c.json(listItems(project, itemsFilter(c.req.query()))))
    .get('/items/:id', (c) => c.json(showItem(project, c.req.param('id'), HUMAN_IN_UI)))
    .post('/items/:id/move', async (c) => {
      assertWritable(c, auth);
      const request = await moveRequest(c);
      return c.json(moveItem(project, { id: c.req.param('id'), ...request, ...HUMAN_IN_UI }));
    })
    .get('/stream', (c) => streams.handle(c))
    .all('*', (c) => c.json(errorBody('not_found', `No route ${c.req.path}`), 404));
}

export function createServer(project: Project, options: ServerOptions = {}): OteaServer {
  const feed = createChangeFeed(project.db, options.pollIntervalMs);
  const streams = liveStreams(feed);
  let port = DEFAULT_PORT;
  const app = new Hono();
  app.use(async (c, next) => {
    const host = c.req.header('host');
    if (!isAllowedHost(host, port)) throw new ForbiddenHost(`Host "${host ?? ''}" is not allowed`);
    await next();
  });
  mountAuth(app, options.token);
  app.route('/api', api(project, streams, session(options.token)));
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
