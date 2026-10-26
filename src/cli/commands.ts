import { join } from 'node:path';
import { addCollection, DEFAULT_PRESET } from '../app/collections.ts';
import { createItem, type ListItemsFilter, listItems, moveItem, showItem } from '../app/items.ts';
import { initProject, openProject, type Project } from '../app/project.ts';
import type { FieldValues } from '../core/fields.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { DEFAULT_PORT, listen } from '../server/listen.ts';
import { createServer } from '../server/server.ts';
import { type Command, type Input, UsageError } from './command.ts';
import { formatItem, formatItems, formatItemWithEvents } from './format.ts';

function withProject<T>(cwd: string, use: (project: Project) => T): T {
  const project = openProject(cwd);
  try {
    return use(project);
  } finally {
    project.db.close();
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
  summary: `Add a collection governed by a preset (default: ${DEFAULT_PRESET})`,
  args: ['name'],
  options: { preset: {} },
  execute: ({ cwd, option, args: [name = ''] }) => {
    const preset = option('preset') ?? DEFAULT_PRESET;
    const collection = withProject(cwd, (project) => addCollection(project, { name, preset }));
    const { prefix, presetVersion } = collection;
    return {
      data: collection,
      text: `Added collection "${name}" with preset ${preset} v${presetVersion} (ids ${prefix}-<n>)`,
    };
  },
};

function fieldsFrom({ option, options }: Input): FieldValues {
  const fields: FieldValues = {};
  const set = (key: string, value: string) => {
    if (key === 'title') throw new UsageError('Use --title for the title');
    if (key in fields) throw new UsageError(`Field "${key}" given twice`);
    fields[key] = value;
  };
  const description = option('description');
  if (description !== undefined) set('description', description);
  for (const pair of options('field')) {
    const separator = pair.indexOf('=');
    if (separator < 1) throw new UsageError(`--field expects key=value, got "${pair}"`);
    set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return fields;
}

const create: Command = {
  name: 'create',
  summary:
    'Create an item and print its id; it starts incomplete when a field required to complete it is missing',
  args: [],
  options: {
    collection: { required: true },
    title: { required: true },
    description: {},
    field: { multiple: true, placeholder: 'key=value' },
  },
  execute: (input) => {
    const collection = input.required('collection');
    const title = input.required('title');
    const fields = fieldsFrom(input);
    const { actor } = input;
    const item = withProject(input.cwd, (project) =>
      createItem(project, { collection, title, fields, actor }),
    );
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
    const items = withProject(input.cwd, (project) => listItems(project, listFilter(input)));
    return { data: items, text: formatItems(items) };
  },
};

const show: Command = {
  name: 'show',
  summary: 'Show an item, its fields, the moves available to the agent and its events timeline',
  args: ['id'],
  options: {},
  execute: ({ cwd, actor, args: [id = ''] }) => {
    const performer = { actor, channel: 'cli' as const };
    const item = withProject(cwd, (project) => showItem(project, id, performer));
    return { data: item, text: formatItemWithEvents(item) };
  },
};

const move: Command = {
  name: 'move',
  summary: 'Move an item to another state its workflow allows the agent to reach',
  args: ['id', 'state'],
  options: { reason: {} },
  execute: ({ cwd, actor, option, args: [id = '', to = ''] }) => {
    const reason = option('reason');
    const input = { id, to, actor, channel: 'cli' as const, ...(reason ? { reason } : {}) };
    const item = withProject(cwd, (project) => moveItem(project, input));
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
