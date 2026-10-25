import { Hono } from 'hono';
import { getItem, type ListItemsFilter, listItems } from '../app/items.ts';
import type { Project } from '../app/project.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { errorBody, InvalidQuery, toErrorResponse } from './errors.ts';

export type OteaServer = { app: Hono };

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

function api(project: Project): Hono {
  return new Hono()
    .get('/items', (c) => c.json(listItems(project.db, itemsFilter(c.req.query()))))
    .get('/items/:id', (c) => c.json(getItem(project.db, c.req.param('id'))))
    .all('*', (c) => c.json(errorBody('not_found', `No route ${c.req.path}`), 404));
}

export function createServer(project: Project): OteaServer {
  const app = new Hono();
  app.route('/api', api(project));
  app.onError((error, c) => {
    const { status, body } = toErrorResponse(error);
    return c.json(body, status);
  });
  return { app };
}
