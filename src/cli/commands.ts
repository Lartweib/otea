import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AgentsMdAction, connectAgent, writeAgentsMd } from '../app/agents.ts';
import { addCollection, DEFAULT_PRESET, typeOfItem } from '../app/collections.ts';
import { listEvents } from '../app/events.ts';
import { attachEvidence } from '../app/evidence.ts';
import {
  createItem,
  type ListItemsFilter,
  listItems,
  moveItem,
  oldestWaiting,
  showItem,
  updateItem,
} from '../app/items.ts';
import { claimItem, heartbeatItem, releaseItem } from '../app/leases.ts';
import { collectionPlaybook, hintFor, playbookIndex } from '../app/playbook.ts';
import { initProject, openProject, oteaDir, type Project } from '../app/project.ts';
import { linkItems, unlinkItems } from '../app/relations.ts';
import { relayDecision } from '../app/relay.ts';
import { validateProject } from '../app/validate.ts';
import { watch } from '../app/watch.ts';
import { EVIDENCE_ROLES, type EvidenceRole, MAX_EVIDENCE_MB } from '../core/evidence.ts';
import type { FieldValues } from '../core/fields.ts';
import { parseDuration } from '../core/lease.ts';
import { describeRelation, RELATION_KINDS } from '../core/relations.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { createMcpServer, serveStdio } from '../mcp/server.ts';
import { DEFAULT_PORT, listen } from '../server/listen.ts';
import { createServer } from '../server/server.ts';
import { ensureUiToken, readUiToken } from '../server/token.ts';
import type { EventFilter } from '../store/queries.ts';
import { type Command, CommandFailure, type Input, UsageError } from './command.ts';
import {
  columns,
  formatEvent,
  formatEvidence,
  formatItem,
  formatItems,
  formatItemWithEvents,
  formatReport,
  indent,
} from './format.ts';
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

async function withProjectWhile<T>(cwd: string, use: (project: Project) => Promise<T>): Promise<T> {
  const project = openProject(cwd);
  try {
    return await use(project);
  } finally {
    project.db.close();
  }
}

const AGENTS_MD_TEXT: Readonly<Record<AgentsMdAction, (path: string) => string>> = {
  created: (path) => `Added the Otea block to ${path}`,
  added: (path) => `Added the Otea block to ${path}`,
  updated: (path) => `Updated the Otea block in ${path}`,
  unchanged: (path) => `The Otea block in ${path} is up to date`,
};

const init: Command = {
  name: 'init',
  summary:
    'Create or reuse the .otea project at the repository root; --agents-md also adds (or refreshes) a block in AGENTS.md telling agents to run "otea playbook"',
  args: [],
  options: { 'agents-md': { flag: true } },
  execute: ({ cwd, flag }) => {
    const { root, db } = initProject(cwd);
    db.close();
    const path = join(root, '.otea');
    if (!flag('agents-md')) return { data: { root, path }, text: path };
    const agentsMd = writeAgentsMd(root);
    const text = `${path}\n${AGENTS_MD_TEXT[agentsMd.action](agentsMd.path)}`;
    return { data: { root, path, agentsMd }, text };
  },
};

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

const connect: Command = {
  name: 'connect',
  summary:
    'Pin an agent name in the project MCP config (.mcp.json) so every MCP action is attributed to it; asks for the name unless --as gives it',
  args: [],
  options: {},
  execute: async ({ cwd, option, ask }) => {
    const root = withProject(cwd, (project) => project.root);
    const name = option('as') ?? (await ask('Agent name (short, like claude-b): '))?.trim();
    if (name === undefined) throw new UsageError('Name the agent with --as <name>');
    const connection = connectAgent(root, name, MAIN);
    const text = `Connected "${name}": ${connection.path} serves otea mcp --as ${name}`;
    return { data: connection, text };
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
    type: { placeholder: 'type' },
    title: { required: true },
    description: {},
    field: { multiple: true, placeholder: 'key=value' },
    parent: { placeholder: 'id' },
  },
  execute: (input) => {
    const collection = input.required('collection');
    const type = input.option('type');
    const title = input.required('title');
    const parent = input.option('parent');
    const fields = fieldsFrom(input);
    const { actor, channel } = input;
    const item = withProject(input.cwd, (project) =>
      createItem(project, {
        collection,
        ...(type === undefined ? {} : { type }),
        title,
        fields,
        ...(parent === undefined ? {} : { parent }),
        actor,
        channel,
      }),
    );
    return { data: item, text: item.id };
  },
};

function listFilter({ option, flag, actor }: Input): ListItemsFilter {
  const filter: ListItemsFilter = {};
  const collection = option('collection');
  const state = option('state');
  const type = option('type');
  const turn = option('turn');
  const parent = option('parent');
  if (collection !== undefined) filter.collection = collection;
  if (parent !== undefined) filter.parent = parent;
  if (state !== undefined) filter.state = state;
  if (type !== undefined) filter.type = type;
  if (turn !== undefined) filter.turn = turn as Turn;
  if (flag('unclaimed')) filter.availableTo = actor.name;
  return filter;
}

const list: Command = {
  name: 'list',
  summary:
    'List items in creation order, optionally filtered; --unclaimed hides items others hold, --parent keeps the children of an item',
  args: [],
  options: {
    collection: {},
    type: {},
    state: {},
    turn: { choices: TURNS },
    parent: { placeholder: 'id' },
    unclaimed: { flag: true },
  },
  execute: (input) => {
    const items = withProject(input.cwd, (project) => listItems(project, listFilter(input)));
    return { data: items, text: formatItems(items) };
  },
};

const show: Command = {
  name: 'show',
  summary:
    'Show an item, what to do with it now, its fields, the moves available to the agent and its events timeline',
  args: ['id'],
  options: {},
  execute: ({ cwd, actor, channel, args: [id = ''] }) => {
    const performer = { actor, channel };
    const { item, layout } = withProject(cwd, (project) => {
      const shown = showItem(project, id, performer);
      const hint = hintFor(project, shown, actor.name);
      return { item: { ...shown, hint }, layout: typeOfItem(project, shown).layout };
    });
    return { data: item, text: formatItemWithEvents(item, layout) };
  },
};

const playbook: Command = {
  name: 'playbook',
  summary:
    "Print the playbook an agent follows in a collection; without --collection, the project's collections and how to read each playbook",
  args: [],
  options: { collection: {} },
  execute: ({ cwd, option }) => {
    const name = option('collection');
    return withProject(cwd, (project) => {
      if (name !== undefined) {
        const found = collectionPlaybook(project, name);
        const text =
          found.playbook?.trimEnd() ??
          `The ${found.preset} preset of collection "${name}" has no playbook.`;
        return { data: found, text };
      }
      const collections = playbookIndex(project);
      const text =
        collections.length === 0
          ? 'No collections yet; a human adds one with "otea collection add <name>".'
          : [
              'Each collection follows the playbook of its preset. Read the one you work in before acting:',
              indent(
                columns(collections.map(({ name, preset, command }) => [name, preset, command])),
              ),
            ].join('\n');
      return { data: { collections }, text };
    });
  },
};

const move: Command = {
  name: 'move',
  summary: 'Move an item to another state its workflow allows the agent to reach',
  args: ['id', 'state'],
  options: { reason: {} },
  execute: ({ cwd, actor, channel, option, args: [id = '', to = ''] }) => {
    const reason = option('reason');
    const input = { id, to, actor, channel, ...(reason ? { reason } : {}) };
    const item = withProject(cwd, (project) => moveItem(project, input));
    return { data: item, text: formatItem(item) };
  },
};

const KINDS = RELATION_KINDS.join(', ');

const link: Command = {
  name: 'link',
  summary: `Link an item to another, in this project, with a typed relation (${KINDS}): "<id> blocks <other>" reads as it says, "<id> parent <other>" makes <other> the parent of <id>`,
  args: ['id', 'kind', 'other'],
  options: {},
  execute: ({ cwd, actor, channel, args: [id = '', kind = '', other = ''] }) => {
    const relation = withProject(cwd, (project) =>
      linkItems(project, { id, kind, other, actor, channel }),
    );
    return { data: relation, text: describeRelation(relation) };
  },
};

const unlink: Command = {
  name: 'unlink',
  summary: 'Remove a relation made with "otea link", named the same way',
  args: ['id', 'kind', 'other'],
  options: {},
  execute: ({ cwd, actor, channel, args: [id = '', kind = '', other = ''] }) => {
    const relation = withProject(cwd, (project) =>
      unlinkItems(project, { id, kind, other, actor, channel }),
    );
    return { data: relation, text: `Removed: ${describeRelation(relation)}` };
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
    const { channel } = input;
    const relayed = { id, to, via, channel, quote, ...(reason ? { reason } : {}) };
    const item = withProject(input.cwd, (project) => relayDecision(project, relayed));
    return { data: item, text: formatItem(item) };
  },
};

const COUNT_PATTERN = /^\d+$/;

function countFrom(name: string, value: string | undefined, min: number): number | undefined {
  if (value === undefined) return undefined;
  const count = Number(value);
  if (!COUNT_PATTERN.test(value) || count < min) {
    throw new UsageError(`--${name} must be an integer of at least ${min}`);
  }
  return count;
}

function eventFilter({ option }: Input): EventFilter {
  const filter: EventFilter = {};
  const item = option('item');
  const collection = option('collection');
  const since = countFrom('since', option('since'), 0);
  const limit = countFrom('limit', option('limit'), 1);
  if (item !== undefined) filter.item = item;
  if (collection !== undefined) filter.collection = collection;
  if (since !== undefined) filter.since = since;
  if (limit !== undefined) filter.limit = limit;
  return filter;
}

const events: Command = {
  name: 'events',
  summary:
    'Print the event log in commit order, after the event id given to --since; --follow keeps printing new events until Ctrl+C',
  args: [],
  options: {
    item: { placeholder: 'id' },
    collection: {},
    since: { placeholder: 'event id' },
    limit: { placeholder: 'n' },
    follow: { flag: true },
  },
  execute: async (input) => {
    const filter = eventFilter(input);
    const follow = input.flag('follow');
    if (follow && filter.limit !== undefined) {
      throw new UsageError('--limit cannot be combined with --follow');
    }
    await withProjectWhile(input.cwd, async (project) => {
      let since = filter.since ?? 0;
      const printNew = () => {
        for (const event of listEvents(project, { ...filter, since })) {
          input.print(event, formatEvent(event));
          since = event.id;
        }
        return undefined;
      };
      printNew();
      if (follow) await watch(project.db, printNew, { signal: input.signal });
    });
    return undefined;
  },
};

function durationFrom(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const duration = parseDuration(value);
  if (duration === undefined) {
    throw new UsageError(`--${name} must be a positive duration such as 90s, 15m or 1h`);
  }
  return duration;
}

const ttlFrom = (value: string | undefined) => durationFrom('ttl', value);

const TTL = { ttl: { placeholder: 'duration' } };

// Lease expiry writes nothing, so a wait for unclaimed items also checks again on this timer.
const LEASE_RECHECK_MS = 1000;

const wait: Command = {
  name: 'wait',
  summary:
    'Wait until an item is on the turn and print it as a list row, at once if one already is; the one waiting longest in its state comes first',
  args: [],
  options: {
    turn: { required: true, choices: ['agent', 'human'] },
    collection: {},
    unclaimed: { flag: true },
    timeout: { placeholder: 'duration' },
  },
  execute: async (input) => {
    const turn = input.required('turn');
    const timeout = input.option('timeout');
    const timeoutMs = durationFrom('timeout', timeout);
    const filter = listFilter(input);
    const options = {
      signal: input.signal,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(filter.availableTo === undefined ? {} : { recheckMs: LEASE_RECHECK_MS }),
    };
    const result = await withProjectWhile(input.cwd, async (project) =>
      watch(project.db, () => oldestWaiting(project, filter), options),
    );
    if ('found' in result) return { data: result.found, text: formatItem(result.found) };
    if (result.stopped === 'timeout') {
      throw new CommandFailure('timeout', `No item reached the ${turn} turn within ${timeout}`);
    }
    throw new CommandFailure('interrupted', 'Interrupted while waiting');
  },
};

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

const attach: Command = {
  name: 'attach',
  summary: `Attach a file to an open item as evidence (at most ${MAX_EVIDENCE_MB} MB), into an evidence module of its type that accepts it; --module picks one when several do, --role before and after fill a compare`,
  args: ['id', 'file'],
  options: {
    role: { choices: EVIDENCE_ROLES },
    module: { placeholder: 'id' },
    caption: { placeholder: 'text' },
  },
  execute: ({ cwd, actor, channel, option, args: [id = '', file = ''] }) => {
    const role = option('role') as EvidenceRole | undefined;
    const module = option('module');
    const caption = option('caption');
    const input = {
      id,
      path: resolve(cwd, file),
      actor,
      channel,
      ...(role === undefined ? {} : { role }),
      ...(module === undefined ? {} : { module }),
      ...(caption === undefined ? {} : { caption }),
    };
    const evidence = withProject(cwd, (project) => attachEvidence(project, input));
    return { data: evidence, text: formatEvidence(evidence) };
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

// Stdout carries the protocol, so the command prints nothing itself.
const mcp: Command = {
  name: 'mcp',
  summary:
    'Serve the agent commands as MCP tools on stdin and stdout, acting as the agent named by --as, until the client disconnects',
  args: [],
  options: {},
  execute: async ({ cwd, actor, signal, warn }) => {
    await serveStdio(createMcpServer(COMMANDS, { cwd, actor, warn }), signal);
    return undefined;
  },
};

export const COMMANDS: readonly Command[] = [
  init,
  connect,
  collectionAdd,
  create,
  list,
  show,
  playbook,
  events,
  wait,
  claim,
  heartbeat,
  release,
  update,
  attach,
  link,
  unlink,
  move,
  relay,
  validate,
  serve,
  open,
  mcp,
];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
