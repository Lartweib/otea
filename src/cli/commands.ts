import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { addCollection } from '../app/collections.ts';
import { createItem, getItem, type ListItemsFilter, listItems, moveItem } from '../app/items.ts';
import { initProject, openProject } from '../app/project.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { DEFAULT_PORT, listen } from '../server/listen.ts';
import { createServer } from '../server/server.ts';
import { type Command, type Input, UsageError } from './command.ts';
import { formatItem, formatItems, formatItemWithEvents } from './format.ts';

function withProject<T>(cwd: string, use: (db: DatabaseSync) => T): T {
  const { db } = openProject(cwd);
  try {
    return use(db);
  } finally {
    db.close();
  }
}

const init: Command = {
  name: 'init',
  summary: 'Create or reuse the .otea project at the repository root',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const { root, db } = initProject(cwd);
    db.close();
    const path = join(root, '.otea');
    return { data: { root, path }, text: path };
  },
};

const collectionAdd: Command = {
  name: 'collection add',
  summary: 'Add a collection that uses the built-in tasks workflow',
  args: ['name'],
  options: {},
  execute: ({ cwd, args: [name = ''] }) => {
    const collection = withProject(cwd, (db) => addCollection(db, { name }));
    return {
      data: collection,
      text: `Added collection "${collection.name}" (ids ${collection.prefix}-<n>)`,
    };
  },
};

const create: Command = {
  name: 'create',
  summary: 'Create an item in its collection initial state and print its id',
  args: [],
  options: { collection: { required: true }, title: { required: true }, body: {} },
  execute: ({ cwd, actor, option, required }) => {
    const collection = required('collection');
    const title = required('title');
    const body = option('body') ?? '';
    const item = withProject(cwd, (db) => createItem(db, { collection, title, body, actor }));
    return { data: item, text: item.id };
  },
};

function listFilter({ option }: Input): ListItemsFilter {
  const filter: ListItemsFilter = {};
  const collection = option('collection');
  const state = option('state');
  const turn = option('turn');
  if (collection !== undefined) filter.collection = collection;
  if (state !== undefined) filter.state = state;
  if (turn !== undefined) filter.turn = turn as Turn;
  return filter;
}

const list: Command = {
  name: 'list',
  summary: 'List items in creation order, optionally filtered',
  args: [],
  options: { collection: {}, state: {}, turn: { choices: TURNS } },
  execute: (input) => {
    const items = withProject(input.cwd, (db) => listItems(db, listFilter(input)));
    return { data: items, text: formatItems(items) };
  },
};

const show: Command = {
  name: 'show',
  summary: 'Show an item and its events timeline',
  args: ['id'],
  options: {},
  execute: ({ cwd, args: [id = ''] }) => {
    const item = withProject(cwd, (db) => getItem(db, id));
    return { data: item, text: formatItemWithEvents(item) };
  },
};

const move: Command = {
  name: 'move',
  summary: 'Move an item to another state of its workflow',
  args: ['id', 'state'],
  options: {},
  execute: ({ cwd, actor, args: [id = '', to = ''] }) => {
    const item = withProject(cwd, (db) => moveItem(db, { id, to, actor }));
    return { data: item, text: formatItem(item) };
  },
};

const PORT_PATTERN = /^\d{1,5}$/;

function portFrom(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!PORT_PATTERN.test(value) || port > 65535) {
    throw new UsageError('--port must be an integer between 0 and 65535');
  }
  return port;
}

async function serveUntil(signal: AbortSignal, cwd: string, port: number): Promise<string> {
  const project = openProject(cwd);
  try {
    const running = await listen(createServer(project), port);
    const stop = () => running.close().finally(() => project.db.close());
    signal.addEventListener('abort', stop, { once: true });
    return running.url;
  } catch (error) {
    project.db.close();
    throw error;
  }
}

const serve: Command = {
  name: 'serve',
  summary: `Serve the live read-only UI on 127.0.0.1 (default port ${DEFAULT_PORT}) until Ctrl+C`,
  args: [],
  options: { port: {} },
  execute: async ({ cwd, option, signal }) => {
    const url = await serveUntil(signal, cwd, portFrom(option('port')));
    return { data: { url }, text: `Otea running at ${url}` };
  },
};

export const COMMANDS: readonly Command[] = [init, collectionAdd, create, list, show, move, serve];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
