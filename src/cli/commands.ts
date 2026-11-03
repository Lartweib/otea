import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { type AgentsMdAction, connectAgent, writeAgentsMd } from '../app/agents.ts';
import {
  type AppliedBlueprint,
  applyBlueprint,
  type BlueprintStatus,
  blueprintFindings,
  blueprintStatus,
  coordinationPlaybook,
  updateBlueprint,
} from '../app/blueprints.ts';
import {
  addCollection,
  DEFAULT_PRESET,
  getCollection,
  presetOf,
  typeOfItem,
} from '../app/collections.ts';
import { listEvents } from '../app/events.ts';
import { attachEvidence } from '../app/evidence.ts';
import { checkGate, type GateCheck } from '../app/gates.ts';
import { forgetProjectPath, listProjects, relinkProjectPath, withRegistry } from '../app/home.ts';
import {
  createItem,
  type Item,
  type ListItemsFilter,
  listItems,
  moveItem,
  oldestWaiting,
  showItem,
  updateItem,
} from '../app/items.ts';
import { claimItem, heartbeatItem, releaseItem } from '../app/leases.ts';
import { type MigrationReport, migrateToCommon } from '../app/migrate.ts';
import { collectionPlaybook, hintFor, playbookIndex } from '../app/playbook.ts';
import { addPathToProject, initProject, openProject, type Project } from '../app/project.ts';
import { linkItems, unlinkItems } from '../app/relations.ts';
import { relayDecision } from '../app/relay.ts';
import { validateProject } from '../app/validate.ts';
import { watch } from '../app/watch.ts';
import { OteaError } from '../core/errors.ts';
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
import { mergeTarget, prHeadBranch, readHookEvent } from './claude-hook.ts';
import { type Command, CommandFailure, type Input, type Output, UsageError } from './command.ts';
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
import { currentBranch, repoName } from './gitrepo.ts';
import {
  type HookChange,
  installClaudeHook,
  installGitHook,
  removeClaudeHook,
  removeGitHook,
} from './hooks.ts';
import { probeSignIn } from './probe.ts';
import { readServeFile, removeServeFile, writeServeFile } from './serve-file.ts';

// The text names an item's type only when its collection's preset has several.
function typesShown(project: Project): (item: { collection: string }) => boolean {
  const several = new Map<string, boolean>();
  return ({ collection }) => {
    const known = several.get(collection);
    if (known !== undefined) return known;
    const shown = presetOf(project, getCollection(project.db, collection)).types.length > 1;
    several.set(collection, shown);
    return shown;
  };
}

function itemResult(project: Project, item: Item): { data: Item; text: string } {
  return { data: item, text: formatItem(item, typesShown(project)) };
}

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

function builtText({ blueprint, boards }: AppliedBlueprint): string {
  const listed = boards.map(({ name, preset }) => `${name} (${preset})`).join(', ');
  return `Built from blueprint ${blueprint.name} v${blueprint.version}: ${listed}`;
}

const init: Command = {
  name: 'init',
  summary:
    'Create or reuse the project at the repository root: in the Otea home ($OTEA_HOME, default ~/.otea), or with --local in .otea at the root; --join <project> links the repo to a registered project instead (refused when a project in a folder above covers it, unless --here); --blueprint builds every board of a blueprint, as otea blueprint apply does; --agents-md also adds (or refreshes) a block in AGENTS.md telling agents to run "otea playbook"',
  args: [],
  options: {
    'agents-md': { flag: true },
    here: { flag: true },
    local: { flag: true },
    join: { placeholder: 'project' },
    blueprint: { placeholder: 'name|path' },
  },
  execute: ({ cwd, flag, option }) => {
    const target = option('join');
    const blueprint = option('blueprint');
    if (target !== undefined && (flag('local') || flag('here') || blueprint !== undefined)) {
      throw new UsageError(
        '--join links to an existing project; it takes no --local, --here or --blueprint',
      );
    }
    const options = {
      here: flag('here'),
      local: flag('local'),
      ...(target === undefined ? {} : { join: target }),
    };
    const project = initProject(cwd, options);
    const { root, dataDir: path, storage, identity } = project;
    let built: AppliedBlueprint | undefined;
    try {
      if (blueprint !== undefined) built = applyBlueprint(project, blueprint, cwd);
    } finally {
      project.db.close();
    }
    const data = { root, path, ...identity, storage, ...built };
    const lines = [path, ...(built ? [builtText(built)] : [])];
    if (!flag('agents-md')) return { data, text: lines.join('\n') };
    const agentsMd = writeAgentsMd(root);
    const text = [...lines, AGENTS_MD_TEXT[agentsMd.action](agentsMd.path)].join('\n');
    return { data: { ...data, agentsMd }, text };
  },
};

const projectsList: Command = {
  name: 'projects list',
  summary: 'List the registered projects (common storage) with the folders linked to each',
  args: [],
  options: {},
  execute: () => {
    const projects = withRegistry(process.env, listProjects) ?? [];
    const text = projects
      .map(({ id, name, storage, paths }) =>
        [
          `${id}  ${name}  ${storage}`,
          ...paths.map(
            ({ path, kind, missing }) => `  ${path}  ${kind}${missing ? '  (missing)' : ''}`,
          ),
        ].join('\n'),
      )
      .join('\n');
    return { data: projects, text: text || 'No registered projects' };
  },
};

const projectsCurrent: Command = {
  name: 'projects current',
  summary: 'Show the project this folder resolves to: id, name, storage, folder and data folder',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const data = withProject(cwd, ({ identity, storage, root, dataDir }) => ({
      ...identity,
      storage,
      root,
      dataDir,
    }));
    return {
      data,
      text: `${data.id}  ${data.name}  ${data.storage}\n${data.root}\n${data.dataDir}`,
    };
  },
};

const projectsAdd: Command = {
  name: 'projects add',
  summary:
    'Link a folder (another repo, say) to a registered project, so commands run in it use that project',
  args: ['path'],
  options: { to: { required: true, placeholder: 'project' } },
  execute: ({ cwd, required, args: [path = ''] }) => {
    const linked = addPathToProject(resolve(cwd, path), required('to'));
    return { data: linked, text: `Linked ${linked.path} to ${linked.projectId}` };
  },
};

function inRegistry<T>(use: (registry: DatabaseSync) => T): T {
  const result = withRegistry(process.env, use);
  if (result === undefined) throw new OteaError('not_found', 'No project is registered yet');
  return result;
}

const projectsRelink: Command = {
  name: 'projects relink',
  summary:
    'Point a linked folder at where its repo moved; refused unless the new folder has the same remote URL or root commit (--force links it anyway)',
  args: ['old', 'new'],
  options: { force: { flag: true } },
  execute: ({ cwd, flag, warn, args: [from = '', to = ''] }) => {
    const relinked = inRegistry((registry) =>
      relinkProjectPath(registry, resolve(cwd, from), resolve(cwd, to), flag('force')),
    );
    if (relinked.match === 'unknown') {
      warn(`Could not check that ${relinked.link.path} is the same repo (no remote URL or commit)`);
    }
    const text = `Relinked ${relinked.from} to ${relinked.link.path} (${relinked.link.projectId})`;
    return { data: relinked, text };
  },
};

const projectsForget: Command = {
  name: 'projects forget',
  summary:
    'Unlink a folder from its project; the project and its items stay, and with no folder left nothing resolves to it',
  args: ['path'],
  options: {},
  execute: ({ cwd, args: [path = ''] }) => {
    const forgotten = inRegistry((registry) => forgetProjectPath(registry, resolve(cwd, path)));
    const { link, remaining } = forgotten;
    const left =
      remaining === 0
        ? `${link.projectId} has no linked folder left; its data stays, link one with otea projects add`
        : `${link.projectId} keeps ${remaining} linked folder${remaining === 1 ? '' : 's'}`;
    return { data: forgotten, text: `Forgot ${link.path}\n${left}` };
  },
};

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function migrationText(report: MigrationReport): string {
  const { status, id, root, to, from, backup, tables, files, undo } = report;
  if (status === 'already') return `${id} is already in common storage at ${to}; nothing to do`;
  const rows = Object.entries(tables)
    .map(([table, { rows }]) => `${table} ${rows}`)
    .join(', ');
  const lines =
    status === 'migrated'
      ? [
          `Copied and verified the database into ${to} (${rows})`,
          `Copied ${files} evidence, preset and blueprint file${files === 1 ? '' : 's'}`,
          `Registered ${id} and linked ${root}`,
        ]
      : [`${id} was already copied to ${to} and registered`];
  return [
    ...lines,
    `Moved ${from} to ${backup} (a backup: Otea never deletes it)`,
    'To undo:',
    ...undo.map((step) => `  ${step}`),
  ].join('\n');
}

const migrateCommand: Command = {
  name: 'migrate',
  summary:
    'Move the local project (.otea/) into common storage in the Otea home, verified, keeping the old folder as a backup; refused while otea serve runs on it',
  args: [],
  options: { to: { required: true, choices: ['common'] } },
  execute: ({ cwd, required }) => {
    required('to');
    const dir = withProject(cwd, (project) => project.dataDir);
    const server = readServeFile(dir);
    if (server && processAlive(server.pid)) {
      throw new OteaError(
        'in_use',
        `otea serve (pid ${server.pid}, port ${server.port}) holds the project; stop it first`,
      );
    }
    const report = migrateToCommon(cwd);
    return { data: report, text: migrationText(report) };
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

const blueprintApply: Command = {
  name: 'blueprint apply',
  summary:
    "Build every board of a blueprint (a name, or the path of a blueprint.yaml or its folder) in this project and keep a copy of it in the project's data folder; a collection of the same name and preset becomes its board",
  args: ['blueprint'],
  options: {},
  execute: ({ cwd, args: [ref = ''] }) => {
    const built = withProject(cwd, (project) => applyBlueprint(project, ref, cwd));
    return { data: built, text: builtText(built) };
  },
};

function statusText({ name, version, origin, path, upToDate, missing, changes }: BlueprintStatus) {
  const from = origin === 'path' ? path : `${origin} blueprint`;
  const head = `${name} v${version} (${from})`;
  if (missing !== undefined) return `${head}: its source cannot be read: ${missing}`;
  if (upToDate) return `${head}: up to date`;
  return [`${head}: the source changed`, indent(changes.join('\n'))].join('\n');
}

const blueprintStatusCommand: Command = {
  name: 'blueprint status',
  summary:
    "Compare the project's copy of its blueprint with its source and list what the source changed since it was copied",
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const status = withProject(cwd, blueprintStatus);
    return { data: status, text: statusText(status) };
  },
};

const NOTHING_APPLIED = { applied: [], kept: [] };

const blueprintUpdateCommand: Command = {
  name: 'blueprint update',
  summary:
    'Bring what the source of the blueprint changed into the project, after confirmation (--yes skips it): adds boards and connections, and never deletes a board that has items, reporting it instead',
  args: [],
  options: { yes: { flag: true } },
  execute: ({ cwd, flag, ask, print }) =>
    withProjectWhile(cwd, async (project) => {
      const status = blueprintStatus(project);
      if (status.missing !== undefined) throw new OteaError('not_found', statusText(status));
      if (status.upToDate) {
        return { data: { ...status, ...NOTHING_APPLIED }, text: statusText(status) };
      }
      if (!flag('yes')) {
        print(status, statusText(status));
        const answer = await ask('Apply these changes? [y/N] ');
        if (answer === undefined) {
          throw new UsageError('Nobody to confirm the changes; pass --yes to apply them');
        }
        if (!/^y(es)?$/i.test(answer.trim())) {
          return { data: { ...status, ...NOTHING_APPLIED }, text: 'Nothing applied' };
        }
      }
      const updated = updateBlueprint(project);
      const text = [...updated.applied, ...updated.kept].join('\n');
      return { data: updated, text: text || 'Refreshed the copy of the blueprint' };
    }),
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
  for (const pair of options('field')) set(...fieldPair(pair));
  return fields;
}

function fieldPair(pair: string): [string, string] {
  const separator = pair.indexOf('=');
  if (separator < 1) throw new UsageError(`--field expects key=value, got "${pair}"`);
  return [pair.slice(0, separator), pair.slice(separator + 1)];
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

function listFilter({ option, options, flag, actor }: Input): ListItemsFilter {
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
  for (const [key, value] of options('field').map(fieldPair)) {
    filter.fields ??= {};
    if (key in filter.fields) throw new UsageError(`Field "${key}" given twice`);
    filter.fields[key] = value;
  }
  return filter;
}

const list: Command = {
  name: 'list',
  summary:
    'List items in creation order, optionally filtered; --unclaimed hides items others hold, --parent keeps the children of an item, --field key=value (repeatable) keeps items whose field holds exactly that value',
  args: [],
  options: {
    collection: {},
    type: {},
    state: {},
    turn: { choices: TURNS },
    parent: { placeholder: 'id' },
    field: { multiple: true, placeholder: 'key=value' },
    unclaimed: { flag: true },
  },
  execute: (input) => {
    return withProject(input.cwd, (project) => {
      const items = listItems(project, listFilter(input));
      return { data: items, text: formatItems(items, typesShown(project)) };
    });
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
    return withProject(cwd, (project) => {
      const shown = showItem(project, id, performer);
      const item = { ...shown, hint: hintFor(project, shown, actor.name) };
      const { layout } = typeOfItem(project, shown);
      return { data: item, text: formatItemWithEvents(item, layout, typesShown(project)) };
    });
  },
};

const playbook: Command = {
  name: 'playbook',
  summary:
    "Print the playbook an agent follows in a collection, its preset's then each type's own; without --collection, the project's collections and how to read each playbook, then the coordination playbook of the project's blueprint when it has one",
  args: [],
  options: { collection: {} },
  execute: ({ cwd, option }) => {
    const name = option('collection');
    return withProject(cwd, (project) => {
      if (name !== undefined) {
        const found = collectionPlaybook(project, name);
        const text = [
          found.playbook?.trimEnd() ??
            `The ${found.preset} preset of collection "${name}" has no playbook.`,
          ...found.types.map(
            ({ type, playbook }) => `--- Type ${type} ---\n\n${playbook.trimEnd()}`,
          ),
        ].join('\n\n');
        return { data: found, text };
      }
      const collections = playbookIndex(project);
      const blueprint = coordinationPlaybook(project);
      const index =
        collections.length === 0
          ? 'No collections yet; a human adds one with "otea collection add <name>".'
          : [
              'Each collection follows the playbook of its preset. Read the one you work in before acting:',
              indent(
                columns(collections.map(({ name, preset, command }) => [name, preset, command])),
              ),
            ].join('\n');
      if (blueprint === undefined) return { data: { collections }, text: index };
      const text = [
        index,
        `The boards work together under the blueprint "${blueprint.name}":`,
        blueprint.playbook.trimEnd(),
      ].join('\n\n');
      return { data: { collections, blueprint }, text };
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
    return withProject(cwd, (project) => itemResult(project, moveItem(project, input)));
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
    return withProject(input.cwd, (project) =>
      itemResult(project, relayDecision(project, relayed)),
    );
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
    const result = await withProjectWhile(input.cwd, async (project) => {
      const waited = await watch(project.db, () => oldestWaiting(project, filter), options);
      return 'found' in waited ? itemResult(project, waited.found) : waited;
    });
    if ('data' in result) return result;
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
    return withProject(cwd, (project) => itemResult(project, claimItem(project, input)));
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
    return withProject(cwd, (project) => itemResult(project, heartbeatItem(project, input)));
  },
};

const release: Command = {
  name: 'release',
  summary: 'Drop the lease you hold on an item; moving it off the agent turn releases it too',
  args: ['id'],
  options: {},
  execute: ({ cwd, actor, args: [id = ''] }) => {
    return withProject(cwd, (project) => itemResult(project, releaseItem(project, { id, actor })));
  },
};

const validate: Command = {
  name: 'validate',
  summary:
    'Check presets, blueprints, collections and items without fixing anything; fails only on errors, not warnings',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const report = withProject(cwd, (project) =>
      validateProject(project, blueprintFindings(project)),
    );
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
    return withProject(input.cwd, (project) => itemResult(project, updateItem(project, changes)));
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
    const dir = project.dataDir;
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
    const dir = withProject(cwd, (project) => project.dataDir);
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

// The fields a gate check matches: --field pairs, plus the branch and the repo, which default to
// the git checkout's when given without a value (the branch to `defaultBranch`, when given).
function gateFields(
  { option, options }: Input,
  cwd: string,
  defaultBranch = () => currentBranch(cwd),
): Record<string, string> {
  const fields: Record<string, string> = {};
  const set = (key: string, value: string) => {
    if (key in fields) throw new UsageError(`Field "${key}" given twice`);
    fields[key] = value;
  };
  for (const pair of options('field')) set(...fieldPair(pair));
  const branch = option('branch');
  if (branch !== undefined) set('branch', branch || defaultBranch());
  const repo = option('repo');
  if (repo !== undefined) set('repo', repo || repoName(cwd));
  return fields;
}

function gateText({ gate, allowed, items }: GateCheck): string {
  if (allowed) {
    const states = items.map(({ id, state }) => `${id} is ${state}`);
    return `${gate} allowed: ${states.join(', ')}`;
  }
  return items
    .filter((item) => !item.allowed)
    .map(
      ({ id, state, allowedIn }) =>
        `${gate} refused: ${id} is ${state}; ${gate} is allowed only in ${allowedIn.join(', ')}`,
    )
    .join('\n');
}

// A gate check fails open: anything that keeps it from answering allows the action, with a note.
// As a Claude Code hook it reads the call from the event on stdin: it checks where the call runs
// and, for `gh pr merge <pr>`, the head branch of that PR; it refuses with exit 2 and the reason on
// stderr, which blocks the call.
const check: Command = {
  name: 'check',
  summary:
    'Check whether the items matching the fields allow a gated action: exit 0 when allowed, 1 when refused; it allows the action, with a note, when no item matches or the check cannot run. --branch and --repo default to the git checkout; --claude-hook reads a Claude Code PreToolUse event on stdin and refuses with exit 2',
  args: [],
  options: {
    gate: { required: true, placeholder: 'action' },
    field: { multiple: true, placeholder: 'key=value' },
    branch: { optionalValue: true, placeholder: 'name' },
    repo: { optionalValue: true, placeholder: 'name' },
    'claude-hook': { flag: true },
  },
  execute: async (input) => {
    const gate = input.required('gate');
    const hook = input.flag('claude-hook');
    let result: GateCheck;
    try {
      const event = hook ? readHookEvent(await input.stdin()) : {};
      const cwd = event.cwd ?? input.cwd;
      const pr = event.command === undefined ? undefined : mergeTarget(event.command);
      const fields = gateFields(input, cwd, () =>
        pr === undefined ? currentBranch(cwd) : prHeadBranch(cwd, pr),
      );
      result = withProject(cwd, (project) => checkGate(project, gate, fields));
    } catch (error) {
      if (error instanceof UsageError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      result = { gate, allowed: true, items: [], note: `could not check (${message})` };
    }
    if (result.note) input.warn(`${result.note}; ${gate} allowed`);
    if (result.items.length === 0) return { data: result, text: '' };
    const text = gateText(result);
    if (result.allowed) return { data: result, text };
    if (!hook) return { data: result, text, failure: 'gate_refused' };
    input.warn(text);
    return { data: result, text: '', failure: 'hook_refused' };
  },
};

const HOOK_OPTIONS = { git: { flag: true }, claude: { flag: true } };

// The hooks a command names: --git, --claude or both, never none.
function hookTargets({ flag }: Input): Array<'git' | 'claude'> {
  const targets = (['git', 'claude'] as const).filter((target) => flag(target));
  if (targets.length === 0) throw new UsageError('Name the hook: --git, --claude or both');
  return targets;
}

function hookText({ path, action, content, note }: HookChange): string {
  const why = note === undefined ? '' : ` (${note})`;
  if (action === 'unchanged') return `${path} already has the Otea hook${why}`;
  if (action === 'absent') return `${path} has no Otea hook`;
  const done = { created: 'Wrote', updated: 'Rewrote', removed: 'Removed the Otea hook from' }[
    action
  ];
  const head = `${done} ${path}${why}`;
  return content === undefined ? head : `${head}:\n${indent(content.trimEnd())}`;
}

function hookOutput(changes: HookChange[]): Output {
  return { data: changes, text: changes.map(hookText).join('\n') };
}

const hookInstall: Command = {
  name: 'hook install',
  summary:
    'Make the gates hard in the repo here: --git writes a pre-push hook that runs otea check --gate push, --claude adds Claude Code PreToolUse hooks that run otea check before git push and gh pr merge; never overwrites a hook of someone else',
  args: [],
  options: HOOK_OPTIONS,
  execute: (input) =>
    hookOutput(
      hookTargets(input).map((target) =>
        target === 'git' ? installGitHook(input.cwd, MAIN) : installClaudeHook(input.cwd, MAIN),
      ),
    ),
};

const hookRemove: Command = {
  name: 'hook remove',
  summary: 'Remove the hooks otea hook install wrote (--git, --claude), leaving every other hook',
  args: [],
  options: HOOK_OPTIONS,
  execute: (input) =>
    hookOutput(
      hookTargets(input).map((target) =>
        target === 'git' ? removeGitHook(input.cwd) : removeClaudeHook(input.cwd),
      ),
    ),
};

export const COMMANDS: readonly Command[] = [
  init,
  projectsList,
  projectsCurrent,
  projectsAdd,
  projectsRelink,
  projectsForget,
  migrateCommand,
  connect,
  collectionAdd,
  blueprintApply,
  blueprintStatusCommand,
  blueprintUpdateCommand,
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
  check,
  hookInstall,
  hookRemove,
  serve,
  open,
  mcp,
];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
