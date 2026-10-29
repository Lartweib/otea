import { join } from 'node:path';
import { addCollection, DEFAULT_PRESET } from '../app/collections.ts';
import {
  createItem,
  type ListItemsFilter,
  listItems,
  moveItem,
  showItem,
  updateItem,
} from '../app/items.ts';
import { claimItem, heartbeatItem, releaseItem } from '../app/leases.ts';
import { initProject, openProject, oteaDir, type Project } from '../app/project.ts';
import { relayDecision } from '../app/relay.ts';
import { validateProject } from '../app/validate.ts';
import type { FieldValues } from '../core/fields.ts';
import { parseDuration } from '../core/lease.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { DEFAULT_PORT, listen } from '../server/listen.ts';
import { createServer } from '../server/server.ts';
import { ensureUiToken, readUiToken } from '../server/token.ts';
import { type Command, CommandFailure, type Input, UsageError } from './command.ts';
import { formatItem, formatItems, formatItemWithEvents, formatReport } from './format.ts';
import { probeSignIn } from './probe.ts';
import { readServeFile, removeServeFile, writeServeFile } from './serve-file.ts';

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
      createItem(project, { collection, title, fields, actor, channel: 'cli' }),
    );
    return { data: item, text: item.id };
  },
};

function listFilter({ option, flag, actor }: Input): ListItemsFilter {
  const filter: ListItemsFilter = {};
  const collection = option('collection');
  const state = option('state');
  const turn = option('turn');
  if (collection !== undefined) filter.collection = collection;
  if (state !== undefined) filter.state = state;
  if (turn !== undefined) filter.turn = turn as Turn;
  if (flag('unclaimed')) filter.availableTo = actor.name;
  return filter;
}

const list: Command = {
  name: 'list',
  summary: 'List items in creation order, optionally filtered; --unclaimed hides items others hold',
  args: [],
  options: { collection: {}, state: {}, turn: { choices: TURNS }, unclaimed: { flag: true } },
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

// Kept apart from every other write so a harness can ask the human to confirm each relay.
const relay: Command = {
  name: 'relay',
  summary:
    'Record a decision the human made in conversation: move the item as the human, via you (human transitions only; human-ui ones stay in the web UI)',
  args: ['id', 'state'],
  options: { quote: { required: true, placeholder: 'what the human said' }, reason: {} },
  execute: (input) => {
    const [id = '', to = ''] = input.args;
    const quote = input.required('quote');
    const reason = input.option('reason');
    const via = input.actor.name;
    const relayed = { id, to, via, quote, ...(reason ? { reason } : {}) };
    const item = withProject(input.cwd, (project) => relayDecision(project, relayed));
    return { data: item, text: formatItem(item) };
  },
};

function ttlFrom(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const ttl = parseDuration(value);
  if (ttl === undefined) {
    throw new UsageError('--ttl must be a positive duration such as 90s, 15m or 1h');
  }
  return ttl;
}

const TTL = { ttl: { placeholder: 'duration' } };

const claim: Command = {
  name: 'claim',
  summary:
    'Hold an item on the agent turn so no other agent can write it (default --ttl 15m); claiming it again extends it',
  args: ['id'],
  options: TTL,
  execute: ({ cwd, actor, option, args: [id = ''] }) => {
    const ttl = ttlFrom(option('ttl'));
    const input = { id, actor, ...(ttl === undefined ? {} : { ttlMs: ttl }) };
    const item = withProject(cwd, (project) => claimItem(project, input));
    return { data: item, text: formatItem(item) };
  },
};

const heartbeat: Command = {
  name: 'heartbeat',
  summary: 'Extend the lease you hold on an item (default --ttl 15m from now)',
  args: ['id'],
  options: TTL,
  execute: ({ cwd, actor, option, args: [id = ''] }) => {
    const ttl = ttlFrom(option('ttl'));
    const input = { id, actor, ...(ttl === undefined ? {} : { ttlMs: ttl }) };
    const item = withProject(cwd, (project) => heartbeatItem(project, input));
    return { data: item, text: formatItem(item) };
  },
};

const release: Command = {
  name: 'release',
  summary: 'Drop the lease you hold on an item; moving it off the agent turn releases it too',
  args: ['id'],
  options: {},
  execute: ({ cwd, actor, args: [id = ''] }) => {
    const item = withProject(cwd, (project) => releaseItem(project, { id, actor }));
    return { data: item, text: formatItem(item) };
  },
};

const validate: Command = {
  name: 'validate',
  summary:
    'Check presets, collections and items without fixing anything; fails only on errors, not warnings',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const report = withProject(cwd, (project) => validateProject(project));
    const failure = report.errors > 0 ? ('validation_failed' as const) : undefined;
    return { data: report, text: formatReport(report), ...(failure ? { failure } : {}) };
  },
};

const update: Command = {
  name: 'update',
  summary:
    'Change fields of an open item; a blank value clears a field that is not create-required',
  args: ['id'],
  options: {
    title: {},
    description: {},
    field: { multiple: true, placeholder: 'key=value' },
  },
  execute: (input) => {
    const [id = ''] = input.args;
    const title = input.option('title');
    const fields = fieldsFrom(input);
    if (title === undefined && Object.keys(fields).length === 0) {
      throw new UsageError('Nothing to update; pass --title, --description or --field');
    }
    const { actor } = input;
    const changes = { id, fields, actor, ...(title === undefined ? {} : { title }) };
    const item = withProject(input.cwd, (project) => updateItem(project, changes));
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

type Served = { url: string; signInUrl: string };

async function serveUntil(signal: AbortSignal, cwd: string, port: number): Promise<Served> {
  const project = openProject(cwd);
  try {
    const dir = oteaDir(project.root);
    const token = ensureUiToken(dir);
    const running = await listen(createServer(project, { token }), port);
    writeServeFile(dir, { port: running.port, pid: process.pid });
    const stop = () => {
      removeServeFile(dir, process.pid);
      return running.close().finally(() => project.db.close());
    };
    signal.addEventListener('abort', stop, { once: true });
    return { url: running.url, signInUrl: signInUrl(running.url, token) };
  } catch (error) {
    project.db.close();
    throw error;
  }
}

function signInUrl(url: string, token: string): string {
  return `${url}/auth?token=${encodeURIComponent(token)}`;
}

const serve: Command = {
  name: 'serve',
  summary: `Serve the live UI on 127.0.0.1 (default port ${DEFAULT_PORT}) until Ctrl+C and sign this browser in`,
  args: [],
  options: { port: {}, 'no-open': { flag: true } },
  execute: async ({ cwd, option, flag, signal, openUrl, warn }) => {
    const { url, signInUrl } = await serveUntil(signal, cwd, portFrom(option('port')));
    if (!flag('no-open')) {
      await openUrl(signInUrl).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        warn(`Could not open a browser (${reason}); run "otea open" to try again`);
      });
    }
    return { data: { url }, text: `Otea running at ${url}` };
  },
};

function notRunning(message: string): CommandFailure {
  return new CommandFailure('not_running', `${message}; run "otea serve" in this project first`);
}

function portToOpen(dir: string, option: string | undefined): number {
  if (option !== undefined) return portFrom(option);
  return readServeFile(dir)?.port ?? DEFAULT_PORT;
}

const open: Command = {
  name: 'open',
  summary: 'Open the UI of the running "otea serve" in the browser, signed in to act on items',
  args: [],
  options: { port: {} },
  execute: async ({ cwd, option, openUrl }) => {
    const dir = withProject(cwd, (project) => oteaDir(project.root));
    const port = portToOpen(dir, option('port'));
    const token = readUiToken(dir);
    if (!token) throw notRunning('No Otea server has been started for this project');
    const url = `http://127.0.0.1:${port}`;
    const link = signInUrl(url, token);
    const probe = await probeSignIn(link);
    if (probe === 'down') throw notRunning(`No Otea server answers on port ${port}`);
    if (probe === 'other')
      throw notRunning(`The Otea server on port ${port} serves another project`);
    await openUrl(link).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not open a browser (${reason})`);
    });
    return { data: { url }, text: `Opened Otea at ${url}` };
  },
};

export const COMMANDS: readonly Command[] = [
  init,
  collectionAdd,
  create,
  list,
  show,
  claim,
  heartbeat,
  release,
  update,
  move,
  relay,
  validate,
  serve,
  open,
];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
