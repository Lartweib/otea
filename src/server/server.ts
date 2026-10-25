import { Hono } from 'hono';
import { getItem, type ListItemsFilter, listItems } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { createChangeFeed } from './changes.ts';
import { errorBody, InvalidQuery, toErrorResponse } from './errors.ts';
import { type LiveStreams, liveStreams } from './stream.ts';
import { BUILT_UI_DIR, mountUi } from './ui.ts';

export type OteaServer = { app: Hono; close(): void };

export type ServerOptions = { pollIntervalMs?: number; uiDir?: string };

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

function api(project: Project, streams: LiveStreams): Hono {
  return new Hono()
    .get('/items', (c) => c.json(listItems(project.db, itemsFilter(c.req.query()))))
    .get('/items/:id', (c) => c.json(getItem(project.db, c.req.param('id'))))
    .get('/stream', (c) => streams.handle(c))
    .all('*', (c) => c.json(errorBody('not_found', `No route ${c.req.path}`), 404));
}

export function createServer(project: Project, options: ServerOptions = {}): OteaServer {
  const feed = createChangeFeed(project.db, options.pollIntervalMs);
  const streams = liveStreams(feed);
  const app = new Hono();
  app.route('/api', api(project, streams));
  mountUi(app, options.uiDir ?? BUILT_UI_DIR);
  app.onError((error, c) => {
    const { status, body } = toErrorResponse(error);
    return c.json(body, status);
  });
  return {
    app,
    close() {
      streams.closeAll();
      feed.close();
    },
  };
}
