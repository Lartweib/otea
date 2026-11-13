import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { renderUnicodeCompact } from 'uqr';
import { draftToStartFrom, submitAgentDraft } from '../app/agent-draft.ts';
import { type AgentsMdAction, connectAgent, writeAgentsMd } from '../app/agents.ts';
import { addBoard, addBoardSet, type BoardRecord } from '../app/boards.ts';
import { briefFor } from '../app/brief.ts';
import {
  collectionIcon,
  getCollection,
  presetOf,
  setCollectionIcon,
  typeOfItem,
} from '../app/collections.ts';
import { listDevices, revokeDevice } from '../app/devices.ts';
import { listEvents } from '../app/events.ts';
import { attachEvidence } from '../app/evidence.ts';
import { checkGate, type GateCheck } from '../app/gates.ts';
import { boardGuide, type Guide, guideIndex, hintFor } from '../app/guide.ts';
import { forgetProjectPath, listProjects, relinkProjectPath, withRegistry } from '../app/home.ts';
import { hasOwnBoards, type InitBoard, initBoards, NO_BOARDS } from '../app/init-boards.ts';
import {
  createItem,
  getItem,
  type Item,
  type ItemView,
  type ListItemsFilter,
  listItems,
  moveItem,
  oldestWaiting,
  showItem,
  updateItem,
} from '../app/items.ts';
import { claimItem, heartbeatItem, releaseItem } from '../app/leases.ts';
import { type MigrationReport, migrateToCommon } from '../app/migrate.ts';
import {
  approveItem,
  type BoardMoveInput,
  type BoardMoveResult,
  createdTextOf,
  dropItem,
  handoffItem,
  liveBoardOf,
  nextFor,
  sendBackItem,
} from '../app/next.ts';
import { type Harness, seeAgent } from '../app/presence.ts';
import {
  addPathToProject,
  initProject,
  openProject,
  PROJECT_LANG,
  type Project,
  type ProjectView,
  projectView,
  setProjectIcon,
} from '../app/project.ts';
import { linkItems, unlinkItems } from '../app/relations.ts';
import { relayDecision } from '../app/relay.ts';
import {
  addRepo,
  listRepos,
  type Repo,
  readReposAtFolder,
  removeRepo,
  repoNameAt,
  UnknownRepo,
} from '../app/repos.ts';
import { validateProject } from '../app/validate.ts';
import { watch } from '../app/watch.ts';
import { fieldsByName, stateName, valueName } from '../core/board/reading.ts';
import { isSetKey, LISTED_KEYS } from '../core/board/templates.ts';
import { OteaError } from '../core/errors.ts';
import { EVIDENCE_ROLES, type EvidenceRole, MAX_EVIDENCE_MB } from '../core/evidence.ts';
import type { FieldValues } from '../core/fields.ts';
import { assertIconName } from '../core/icons.ts';
import type { Actor } from '../core/item.ts';
import { parseDuration } from '../core/lease.ts';
import { describeRelation, RELATION_KINDS } from '../core/relations.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { createMcpServer, serveStdio } from '../mcp/server.ts';
import { formatCode, lanAddresses, localName } from '../server/lan.ts';
import { ALL_INTERFACES, DEFAULT_PORT, listen } from '../server/listen.ts';
import { pairingUrl } from '../server/pairing.ts';
import { createServer } from '../server/server.ts';
import { ensureUiToken, readUiToken } from '../server/token.ts';
import type { EventFilter } from '../store/queries.ts';
import { mergeTarget, prHeadBranch, pushTargets, readHookEvent } from './claude-hook.ts';
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
import { currentBranch, localBranches } from './gitrepo.ts';
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
  return { data: item, text: formatItem(readable(project, item), typesShown(project)) };
}

// An item on a board as its reader says it: its step by name, its fields and choices by name, its
// moves and events by step names. Hidden ids stay in --json, as the keys a program reads.
function readable<T extends Item>(project: Project, raw: T): T {
  // Each related item's step by name, on its own board.
  const related = (raw as unknown as Partial<ItemView>).relations;
  const item = (
    related
      ? {
          ...raw,
          relations: related.map((r) => {
            // A list's relations are bare refs (no collection or state): nothing to name.
            const { collection, state } = r as { collection?: unknown; state?: unknown };
            if (typeof collection !== 'string' || typeof state !== 'string') return r;
            const on = liveBoardOf(project, collection);
            return on ? { ...r, state: stateName(on.def, state) } : r;
          }),
        }
      : raw
  ) as T;
  const board = liveBoardOf(project, item.collection);
  if (!board) return item;
  const { def } = board;
  const named = (state: unknown) => stateName(def, String(state));
  const out: Record<string, unknown> = {
    ...item,
    state: named(item.state),
    fields: fieldsByName(def, item.fields),
  };
  const view = item as unknown as Partial<ItemView>;
  const moves = (list: ItemView['transitions']) =>
    list.map((move) => ({ ...move, to: named(move.to) }));
  const partName = (ref: unknown) => def.parts[String(ref)]?.name ?? String(ref);
  if (view.transitions) out.transitions = moves(view.transitions);
  if (view.relayable) out.relayable = moves(view.relayable);
  if (view.missing) out.missing = view.missing.map(partName);
  if (view.evidence)
    out.evidence = view.evidence.map((entry) =>
      entry.module === null ? entry : { ...entry, module: partName(entry.module) },
    );
  if (view.events)
    out.events = view.events.map((event) => {
      const { data } = event;
      if (event.type === 'created')
        return { ...event, data: { ...data, state: named(data.state) } };
      if (event.type === 'transitioned')
        return { ...event, data: { ...data, from: named(data.from), to: named(data.to) } };
      if (event.type === 'evidence_added' && typeof data.module === 'string')
        return { ...event, data: { ...data, module: partName(data.module) } };
      if (event.type === 'updated' && data.changes && typeof data.changes === 'object') {
        const changes = Object.fromEntries(
          Object.entries(data.changes as Record<string, { from?: unknown; to?: unknown }>).map(
            ([key, change]) => {
              const part = def.parts[key];
              if (!part) return [key, change];
              const say = (value: unknown) =>
                value === undefined || value === null ? value : valueName(part, value);
              return [part.name, { from: say(change.from), to: say(change.to) }];
            },
          ),
        );
        return { ...event, data: { ...data, changes } };
      }
      return event;
    });
  return out as T;
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

// Notes that the agent running the command was seen, so the UI can show who is at work.
function seen(project: Project, { actor, channel, harness }: Input): void {
  if (actor.kind === 'agent') seeAgent(project.db, { agent: actor.name, channel, harness });
}

// Opens the project for a command an agent runs, noting the agent as seen first.
function withAgent<T>(input: Input, use: (project: Project) => T): T {
  return withProject(input.cwd, (project) => {
    seen(project, input);
    return use(project);
  });
}

async function withAgentWhile<T>(input: Input, use: (project: Project) => Promise<T>): Promise<T> {
  return withProjectWhile(input.cwd, (project) => {
    seen(project, input);
    return use(project);
  });
}

const AGENTS_MD_TEXT: Readonly<Record<AgentsMdAction, (path: string) => string>> = {
  created: (path) => `Added the Otea block to ${path}`,
  added: (path) => `Added the Otea block to ${path}`,
  updated: (path) => `Updated the Otea block in ${path}`,
  unchanged: (path) => `The Otea block in ${path} is up to date`,
};

function boardsText(boards: readonly InitBoard[]): string {
  return `Made the boards ${boards.map(({ name }) => name).join(', ')}`;
}

// The templates the CLI takes, the same Studio's home offers, as its help lists them.
const TEMPLATE_KEYS = LISTED_KEYS.join(', ');

const init: Command = {
  name: 'init',
  summary: `Create or reuse the project at the repository root: in the Otea home ($OTEA_HOME, default ~/.otea), or with --local in .otea at the root; --join <project> links the repo to a registered project instead (refused when a project in a folder above covers it, unless --here); on a project with no boards of its own yet it makes Tareas and Errores, or with --template <key> the boards of that template (${TEMPLATE_KEYS}; a set such as repos or product makes all of its boards; none makes no board but Pedidos, the board for loose requests every project has); on a project that has boards it makes none; --icon gives the project an icon (without one the UI draws a monogram of its name); --agents-md also adds (or refreshes) a block in AGENTS.md telling agents to run "otea next" and "otea board"`,
  args: [],
  options: {
    'agents-md': { flag: true },
    here: { flag: true },
    local: { flag: true },
    join: { placeholder: 'project' },
    template: { placeholder: 'key' },
    icon: { placeholder: 'icon' },
  },
  execute: ({ cwd, flag, option }) => {
    const target = option('join');
    const template = option('template');
    const icon = option('icon');
    if (icon !== undefined) assertIconName(icon);
    if (target !== undefined && (flag('local') || flag('here') || template !== undefined)) {
      throw new UsageError(
        '--join links to an existing project; it takes no --local, --here or --template',
      );
    }
    const options = {
      here: flag('here'),
      local: flag('local'),
      ...(target === undefined ? {} : { join: target }),
    };
    const project = initProject(cwd, options);
    const { root, dataDir: path, storage } = project;
    let made: InitBoard[] = [];
    let shown: ProjectView;
    let kept = false;
    try {
      shown = icon === undefined ? projectView(project) : setProjectIcon(project, icon);
      // The repos at the project's folders are added now, before any clone of them is linked.
      if (target === undefined) {
        kept = template !== undefined && template !== NO_BOARDS && hasOwnBoards(project);
        made = initBoards(project, template);
        listRepos(project);
      } else readReposAtFolder(project, root);
    } finally {
      project.db.close();
    }
    const data = { root, path, ...shown, storage, boards: made };
    const lines = [
      path,
      ...(made.length > 0 ? [boardsText(made)] : []),
      ...(kept
        ? [
            `The project already has boards; add one with otea board add <name> --template ${template}`,
          ]
        : []),
    ];
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
    const repos = withProject(linked.path, (project) => readReposAtFolder(project, linked.path));
    const text = [`Linked ${linked.path} to ${linked.projectId}`, ...reposAddedText(repos)];
    return { data: { ...linked, repos }, text: text.join('\n') };
  },
};

function reposAddedText(repos: readonly Repo[]): string[] {
  if (repos.length === 0) return [];
  return [
    `Added the repo${repos.length === 1 ? '' : 's'} ${repos.map(({ name }) => name).join(', ')}`,
  ];
}

const reposList: Command = {
  name: 'repos list',
  summary:
    "List the project's repos: the name its items give each one (a repo task's repo field) and what tells it apart wherever it is cloned (its origin URL, or its root commit without one)",
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const repos = withProject(cwd, (project) => listRepos(project));
    const text = repos.map(({ name, identity }) => `${name}  ${identity}`).join('\n');
    return { data: repos, text: text || 'No repos' };
  },
};

const reposAdd: Command = {
  name: 'repos add',
  summary:
    'Add the repo at a folder (default: here) to the project, under --name or its folder name; a repo already added is renamed by --name. Every clone of it, in any folder, goes by that name in gate checks',
  args: ['path?'],
  options: { name: { placeholder: 'name' } },
  execute: ({ cwd, option, args: [path = '.'] }) => {
    const repo = withProject(cwd, (project) =>
      addRepo(project, resolve(cwd, path), option('name')),
    );
    return { data: repo, text: `${repo.name}  ${repo.identity}` };
  },
};

const reposRemove: Command = {
  name: 'repos remove',
  summary:
    'Remove a repo from the project by name; its items keep their values, and gate checks refuse in it until it is added again',
  args: ['name'],
  options: {},
  execute: ({ cwd, args: [name = ''] }) => {
    const repo = withProject(cwd, (project) => removeRepo(project, name));
    return { data: repo, text: `Removed ${repo.name}` };
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
          `Copied ${files} evidence and preset file${files === 1 ? '' : 's'}`,
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

// `default` is no icon name, so it can stand for going back to the preset's icon.
const DEFAULT_ICON = 'default';

const collectionIconCommand: Command = {
  name: 'collection icon',
  summary: `Give a collection its own icon, or "${DEFAULT_ICON}" to show its preset's again`,
  args: ['name', 'icon'],
  options: {},
  execute: ({ cwd, args: [name = '', icon = ''] }) => {
    const collection = withProject(cwd, (project) => {
      const changed = setCollectionIcon(project, name, icon === DEFAULT_ICON ? null : icon);
      return { ...changed, icon: collectionIcon(project, changed) };
    });
    const own = icon === DEFAULT_ICON ? ` (its preset's)` : '';
    return {
      data: collection,
      text: `Collection "${name}" shows icon ${collection.icon ?? 'none'}${own}`,
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
    'Create an item and say where it starts: on a board whose first step is skipped for an item that has everything it asks, at the next step; an item of a board that is always part of another needs --parent',
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
    return withAgent(input, (project) => {
      const item = createItem(project, {
        collection,
        ...(type === undefined ? {} : { type }),
        title,
        fields,
        ...(parent === undefined ? {} : { parent }),
        actor,
        channel,
      });
      // On a board: where it starts, and why when its first step was skipped or lacks something.
      return { data: item, text: createdTextOf(project, item) ?? item.id };
    });
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
    return withAgent(input, (project) => {
      const items = listItems(project, listFilter(input));
      const shown = items.map((item) => readable(project, item));
      return { data: items, text: formatItems(shown, typesShown(project)) };
    });
  },
};

const show: Command = {
  name: 'show',
  summary:
    'Show an item, what to do with it now, its fields, the moves available to the agent and its events timeline',
  args: ['id'],
  options: {},
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, channel } = input;
    const performer = { actor, channel };
    return withAgent(input, (project) => {
      const shown = showItem(project, id, performer);
      const item = { ...shown, hint: hintFor(project, shown, actor.name) };
      const { layout } = typeOfItem(project, shown);
      const named = liveBoardOf(project, item.collection) !== undefined;
      const text = formatItemWithEvents(
        readable(project, item),
        layout,
        typesShown(project),
        named,
      );
      return { data: item, text };
    });
  },
};

function guideText(guide: Guide): string {
  return guide.text;
}

const boardName = (record: BoardRecord) => (record.live ?? record.draft)?.definition.name ?? '';

const boardAdd: Command = {
  name: 'board add',
  summary: `Make a board and publish it, from a template (${TEMPLATE_KEYS}) or blank, in the project's language; --item names what each item is; a set such as repos or product makes all of its boards, the name and --item naming the first`,
  args: ['name'],
  options: { template: { placeholder: 'key' }, item: {} },
  execute: ({ cwd, args: [name = ''], option }) => {
    const template = option('template');
    const item = option('item');
    if (template !== undefined && isSetKey(template)) {
      const boards = withProject(cwd, (project) =>
        addBoardSet(project, {
          set: template,
          lang: PROJECT_LANG,
          by: { kind: 'human', name: 'human' },
          boards: [{ name, ...(item === undefined ? {} : { item }) }],
        }),
      );
      const names = boards.map(({ record }) => `"${boardName(record)}"`).join(', ');
      return { data: boards, text: `Published boards ${names} from template ${template}` };
    }
    const added = withProject(cwd, (project) =>
      addBoard(project, {
        name,
        lang: PROJECT_LANG,
        by: { kind: 'human', name: 'human' },
        ...(template === undefined ? {} : { template }),
        ...(item === undefined ? {} : { item }),
      }),
    );
    const prefix = added.record.collection
      ? withProject(
          cwd,
          (project) => getCollection(project.db, added.record.collection ?? '').prefix,
        )
      : '';
    const from = template === undefined ? 'blank' : `from template ${template}`;
    return {
      data: added,
      text: `Published board "${name.trim()}" v${added.version} ${from} (ids ${prefix}-<n>)`,
    };
  },
};

const boardDraft: Command = {
  name: 'board draft',
  summary:
    'Draft the board a Pedido asks for: without --file, print the draft to start from (JSON); with --file, check it as a board and hand it in on the Pedido as board.json, saying what is still wrong',
  args: ['id'],
  options: { file: { placeholder: 'board.json' } },
  execute: (input) => {
    const [id = ''] = input.args;
    const file = input.option('file');
    return withAgent(input, (project) => {
      if (file === undefined) {
        const definition = draftToStartFrom(project, id);
        return { data: definition, text: JSON.stringify(definition, null, 2) };
      }
      const path = resolve(input.cwd, file);
      let text: string;
      try {
        text = readFileSync(path, 'utf8');
      } catch {
        throw new OteaError('file_not_found', `No file at ${path}`);
      }
      const { actor, channel } = input;
      const submitted = submitAgentDraft(project, { id, text, actor, channel });
      const lines = [
        `Handed in the board draft on ${id} (evidence ${submitted.evidence.id}); it is in Studio now, for the person to try and publish.`,
        ...(submitted.problems.length === 0
          ? []
          : ['Still to fix, for it to be published:', ...submitted.problems.map((p) => `  ${p}`)]),
      ];
      return { data: submitted, text: lines.join('\n') };
    });
  },
};

const board: Command = {
  name: 'board',
  summary:
    "Print what agents read about a board before acting: its own words for them and each step's instructions; without a name, the project's boards and how to read each",
  args: ['name?'],
  options: {},
  execute: (input) => {
    const [name = ''] = input.args;
    return withAgent(input, (project) => {
      if (name !== '') {
        const guide = boardGuide(project, name);
        return { data: guide, text: guideText(guide) };
      }
      const boards = guideIndex(project);
      const index =
        boards.length === 0
          ? 'No boards yet; a human makes one in Studio or with "otea board add <name>".'
          : [
              'Read the board you work in before acting:',
              indent(
                columns(
                  boards.map(({ name: each, board: id, command }) => [
                    each,
                    id === null ? 'draft' : 'board',
                    command,
                  ]),
                ),
              ),
            ].join('\n');
      return { data: { boards }, text: index };
    });
  },
};

const move: Command = {
  name: 'move',
  summary: 'Move an item to another state its workflow allows the agent to reach',
  args: ['id', 'state'],
  options: { reason: {} },
  execute: (input) => {
    const [id = '', to = ''] = input.args;
    const { actor, channel, option } = input;
    const reason = option('reason');
    const moving = { id, to, actor, channel, ...(reason ? { reason } : {}) };
    return withAgent(input, (project) => itemResult(project, moveItem(project, moving)));
  },
};

const next: Command = {
  name: 'next',
  summary:
    'Say which item to take now on the published boards (or in --collection), oldest first, and what its step asks: what it starts with, the instructions, the handoff and where it goes next; when there is none, what to do meanwhile',
  args: [],
  options: { collection: {} },
  execute: (input) => {
    const collection = input.option('collection');
    return withAgent(input, (project) => {
      const answer = nextFor(
        project,
        input.actor.name,
        collection === undefined ? {} : { collection },
      );
      return { data: answer, text: answer.text };
    });
  },
};

// A move on a board: the engine checks it, the item lands where it says, and the agent reads where
// it stands now.
function boardMove(
  input: Input,
  run: (project: Project, move: BoardMoveInput) => BoardMoveResult,
): Output {
  const [id = ''] = input.args;
  const { actor, channel, option } = input;
  const way = option('way');
  const reason = option('reason');
  const note = option('note');
  const move = {
    id,
    actor,
    channel,
    ...(way === undefined ? {} : { way }),
    ...(reason ? { reason } : {}),
    ...(note ? { note } : {}),
  };
  return withAgent(input, (project) => {
    const { item, text } = run(project, move);
    return { data: { item, text }, text };
  });
}

const handoffCommand: Command = {
  name: 'handoff',
  summary:
    'Hand off the step you did on an item: refused, saying what is missing, until its handoff is complete; then to its review, or along --way (a step name or Done) with --reason when the step has several. --note is the note of the handoff, kept with the round (required where the step asks for one, and after a send-back); --way an earlier step, with --reason, takes the item back to it for its next round',
  args: ['id'],
  options: { way: { placeholder: 'step' }, reason: {}, note: {} },
  execute: (input) => boardMove(input, handoffItem),
};

const dropCommand: Command = {
  name: 'drop',
  summary:
    'Drop an item that is not worth doing, saying why with --reason, and, on a board with motives, which one with --as (its name); an agent drops only while doing a step that lets it, so here --as names the motive, not the agent (set OTEA_AGENT instead)',
  args: ['id'],
  options: { reason: {}, as: { placeholder: 'motive' } },
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, channel, option } = input;
    const reason = option('reason');
    const motive = option('as');
    const dropping = {
      id,
      actor,
      channel,
      ...(reason ? { reason } : {}),
      ...(motive ? { motive } : {}),
    };
    return withAgent(input, (project) => {
      const { item, text } = dropItem(project, dropping);
      return { data: { item, text }, text };
    });
  },
};

const approveCommand: Command = {
  name: 'approve',
  summary: 'Approve the step you review on an item, along --way when it has several ways out',
  args: ['id'],
  options: { way: { placeholder: 'step' } },
  execute: (input) => boardMove(input, approveItem),
};

const sendBack: Command = {
  name: 'send-back',
  summary:
    'Send the step you review on an item back for another round, saying what to change with --reason',
  args: ['id'],
  options: { reason: { required: true } },
  execute: (input) => {
    input.required('reason');
    return boardMove(input, sendBackItem);
  },
};

const KINDS = RELATION_KINDS.join(', ');

const link: Command = {
  name: 'link',
  summary: `Link an item to another, in this project, with a typed relation (${KINDS}): "<id> blocks <other>" reads as it says, "<id> parent <other>" makes <other> the parent of <id>`,
  args: ['id', 'kind', 'other'],
  options: {},
  execute: (input) => {
    const [id = '', kind = '', other = ''] = input.args;
    const { actor, channel } = input;
    const relation = withAgent(input, (project) =>
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
  execute: (input) => {
    const [id = '', kind = '', other = ''] = input.args;
    const { actor, channel } = input;
    const relation = withAgent(input, (project) =>
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
    return withAgent(input, (project) => itemResult(project, relayDecision(project, relayed)));
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

const brief: Command = {
  name: 'brief',
  summary:
    'Print a Markdown brief for the items given, in the order their blocks allow, with its limits (--constraint, repeatable) and success criteria (--success, repeatable), which replace the default lines',
  args: ['ids...'],
  options: {
    constraint: { multiple: true, placeholder: 'text' },
    success: { multiple: true, placeholder: 'text' },
  },
  execute: ({ cwd, args, options }) => {
    const limits = options('constraint');
    const success = options('success');
    const written = withProject(cwd, (project) =>
      briefFor(project, {
        ids: args,
        ...(limits.length > 0 ? { limits } : {}),
        ...(success.length > 0 ? { success } : {}),
      }),
    );
    return { data: written, text: written.markdown.trimEnd() };
  },
};

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
    await withAgentWhile(input, async (project) => {
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
    const result = await withAgentWhile(input, async (project) => {
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
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, option } = input;
    const ttl = ttlFrom(option('ttl'));
    const lease = { id, actor, ...(ttl === undefined ? {} : { ttlMs: ttl }) };
    return withAgent(input, (project) => itemResult(project, claimItem(project, lease)));
  },
};

const heartbeat: Command = {
  name: 'heartbeat',
  summary: 'Extend the lease you hold on an item (default --ttl 15m from now)',
  args: ['id'],
  options: TTL,
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, option } = input;
    const ttl = ttlFrom(option('ttl'));
    const lease = { id, actor, ...(ttl === undefined ? {} : { ttlMs: ttl }) };
    return withAgent(input, (project) => itemResult(project, heartbeatItem(project, lease)));
  },
};

const release: Command = {
  name: 'release',
  summary: 'Drop the lease you hold on an item; moving it off the agent turn releases it too',
  args: ['id'],
  options: {},
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor } = input;
    return withAgent(input, (project) => itemResult(project, releaseItem(project, { id, actor })));
  },
};

const validate: Command = {
  name: 'validate',
  summary:
    'Check boards, collections and items without fixing anything; fails only on errors, not warnings',
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
    return withAgent(input, (project) => itemResult(project, updateItem(project, changes)));
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
  execute: (input) => {
    const [id = '', file = ''] = input.args;
    const { cwd, actor, channel, option } = input;
    const role = option('role') as EvidenceRole | undefined;
    const module = option('module');
    const caption = option('caption');
    const evidenceInput = {
      id,
      path: resolve(cwd, file),
      actor,
      channel,
      ...(role === undefined ? {} : { role }),
      ...(module === undefined ? {} : { module }),
      ...(caption === undefined ? {} : { caption }),
    };
    return withAgent(input, (project) => {
      const evidence = attachEvidence(project, evidenceInput);
      // On a board, the evidence goes by its name, never its hidden id.
      const board = liveBoardOf(project, getItem(project, evidence.itemId).collection);
      const name = evidence.module === null ? undefined : board?.def.parts[evidence.module]?.name;
      const shown = name === undefined ? evidence : { ...evidence, module: name };
      return { data: evidence, text: formatEvidence(shown) };
    });
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

// With LAN access: the URLs a device on the network opens (the .local name first when it
// resolves), the first pairing code, and the same pairing link by IP when the first is a name.
type LanServed = {
  urls: string[];
  pairingUrl: string | undefined;
  byAddress?: string;
  code: string | undefined;
};

type Served = { url: string; signInUrl: string; lan?: LanServed };

async function serveUntil(
  signal: AbortSignal,
  cwd: string,
  port: number,
  lan: boolean,
): Promise<Served> {
  const project = openProject(cwd);
  try {
    const dir = project.dataDir;
    const token = ensureUiToken(dir);
    const addresses = lan ? lanAddresses() : [];
    const name = lan ? await localName(addresses) : undefined;
    const names = name ? [name] : [];
    const server = createServer(project, lan ? { token, lan: { addresses, names } } : { token });
    const running = await listen(server, port, lan ? ALL_INTERFACES : undefined);
    writeServeFile(dir, { port: running.port, pid: process.pid });
    const stop = () => {
      removeServeFile(dir, process.pid);
      return running.close().finally(() => project.db.close());
    };
    signal.addEventListener('abort', stop, { once: true });
    const served = { url: running.url, signInUrl: signInUrl(running.url, token) };
    if (!server.lan) return served;
    const urls = [...names, ...addresses].map((host) => `http://${host}:${running.port}`);
    const code = server.lan.codes.issue();
    const first = urls[0];
    const address = addresses[0];
    const byAddress =
      names.length > 0 && address !== undefined
        ? { byAddress: pairingUrl(`http://${address}:${running.port}`, code) }
        : {};
    return {
      ...served,
      lan: {
        urls,
        pairingUrl: first === undefined ? undefined : pairingUrl(first, code),
        ...byAddress,
        code: first === undefined ? undefined : formatCode(code.code),
      },
    };
  } catch (error) {
    project.db.close();
    throw error;
  }
}

function signInUrl(url: string, token: string): string {
  return `${url}/auth?token=${encodeURIComponent(token)}`;
}

function lanText(lan: LanServed): string {
  if (lan.pairingUrl === undefined) {
    return 'LAN access is on, but this computer has no private network address a phone could reach';
  }
  return [
    `LAN access on: ${lan.urls.join(', ')} (same network only; use Tailscale when away)`,
    `Pair a phone: scan this code, or open ${lan.pairingUrl} (pairing code ${lan.code}, 10 minutes, works once)`,
    ...(lan.byAddress ? [`If the phone cannot open the .local name, open ${lan.byAddress}`] : []),
    renderUnicodeCompact(lan.pairingUrl, { ecc: 'M', border: 2 }),
    'A new code and the paired devices are in the UI, in Preferences under Pair a phone; otea devices list and revoke them too',
  ].join('\n');
}

const serve: Command = {
  name: 'serve',
  summary: `Serve the live UI on 127.0.0.1 (default port ${DEFAULT_PORT}) until Ctrl+C and sign this browser in; --lan also lets phones on the same network pair and open it`,
  args: [],
  options: { port: {}, 'no-open': { flag: true }, lan: { flag: true } },
  execute: async ({ cwd, option, flag, signal, openUrl, warn }) => {
    const served = await serveUntil(signal, cwd, portFrom(option('port')), flag('lan'));
    const { url, signInUrl, lan } = served;
    if (!flag('no-open')) {
      await openUrl(signInUrl).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        warn(`Could not open a browser (${reason}); run "otea open" to try again`);
      });
    }
    const running = `Otea running at ${url}`;
    if (!lan) return { data: { url }, text: running };
    return { data: { url, lan }, text: `${running}\n${lanText(lan)}` };
  },
};

const devicesList: Command = {
  name: 'devices list',
  summary: 'List the devices paired over the LAN (otea serve --lan), with when each was last seen',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const devices = withProject(cwd, (project) => listDevices(project.db));
    const text = devices
      .map(
        ({ id, name, pairedAt, lastSeenAt, hint }) =>
          `${id}  ${name}  paired ${pairedAt}  last seen ${lastSeenAt ?? 'never'}  token ··${hint}`,
      )
      .join('\n');
    return { data: devices, text: text || 'No paired devices' };
  },
};

const devicesRevoke: Command = {
  name: 'devices revoke',
  summary: 'Revoke a paired device: its token stops working at once, even while otea serve runs',
  args: ['id'],
  options: {},
  execute: ({ cwd, args: [id = ''] }) => {
    const device = withProject(cwd, (project) => revokeDevice(project.db, id));
    return { data: device, text: `Revoked ${device.id} (${device.name})` };
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
// The agent counts as seen as soon as its MCP client connects. Without a project yet there is
// nowhere to note it, and every tool call will say so, so that is no warning.
function greetedBy(cwd: string, actor: Actor, harness: Harness | undefined, warn: Input['warn']) {
  try {
    withProject(cwd, (project) =>
      seeAgent(project.db, { agent: actor.name, channel: 'mcp', harness }),
    );
  } catch (error) {
    if (error instanceof OteaError && error.code === 'not_found') return;
    warn(`could not note ${actor.name} as seen: ${(error as Error).message}`);
  }
}

const mcp: Command = {
  name: 'mcp',
  summary:
    'Serve the agent commands as MCP tools on stdin and stdout, acting as the agent named by --as, until the client disconnects',
  args: [],
  options: {},
  execute: async ({ cwd, actor, signal, warn }) => {
    const greeted = (harness: Harness | undefined) => greetedBy(cwd, actor, harness, warn);
    await serveStdio(createMcpServer(COMMANDS, { cwd, actor, warn, greeted }), signal);
    return undefined;
  },
};

// The fields a gate check matches: --field pairs, plus the branch and the repo, which default to
// the git checkout's when given without a value (the branch to `defaultBranch`, when given; the
// repo to the name the project gives the repo checked out, app/repos.ts).
function gateFields(
  { option, options }: Input,
  cwd: string,
  project: Project,
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
  if (repo !== undefined) set('repo', repo || repoNameAt(project, cwd));
  return fields;
}

function gateText({ gate, allowed, items }: GateCheck): string {
  // On a board, the step engine's words for each item.
  const said = items.filter((item) => allowed || !item.allowed).flatMap(({ text }) => text ?? []);
  if (said.length > 0) return said.join('\n');
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

// The branches a hooked command acts on: the head branch of the PR a `gh pr merge <pr>` names and
// the branches its `git push` calls write to, or the current branch when it names none. Throws
// UntoldTarget for a push that may write to branches it does not name.
function commandBranches(cwd: string, command: string | undefined): string[] {
  const pr = command === undefined ? undefined : mergeTarget(command);
  const push = command === undefined ? undefined : pushTargets(command);
  if (push !== undefined && 'unknown' in push) throw new UntoldTarget(push.unknown);
  if (pr === undefined && push === undefined) return [currentBranch(cwd)];
  const branches = pr === undefined ? [] : [prHeadBranch(cwd, pr)];
  if (push !== undefined) {
    branches.push(...push.branches);
    if (push.current) branches.push(currentBranch(cwd));
    if (push.every) branches.push(...localBranches(cwd));
  }
  return [...new Set(branches)];
}

class UntoldTarget extends Error {}

// One check of the gate for each set of fields (one per branch): refused when any is, with the
// items of all.
function checkBranches(
  project: Project,
  gate: string,
  fieldSets: ReadonlyArray<Record<string, string>>,
): GateCheck {
  if (fieldSets.length === 0) return { gate, allowed: true, items: [], note: 'no branch to check' };
  const checks = fieldSets.map((fields) => checkGate(project, gate, fields));
  const items = checks.flatMap((check) => check.items);
  const result: GateCheck = { gate, allowed: checks.every((check) => check.allowed), items };
  if (items.length === 0 && checks[0]?.note) result.note = checks[0].note;
  return result;
}

// A gate check fails open: anything that keeps it from answering allows the action, with a note.
// As a Claude Code hook it reads the call from the event on stdin: it checks where the call runs
// and, with --branch and no name, the branches the call acts on (see commandBranches); it refuses
// with exit 2 and the reason on stderr, which blocks the call. A push whose branches it cannot
// tell is refused, not allowed: on a project, failing open there would skip every gate. So is a
// push or merge in a repo the project cannot match (--repo with no name), whatever its folder.
const check: Command = {
  name: 'check',
  summary:
    'Check whether the items matching the fields allow a gated action: exit 0 when allowed, 19 when refused, 2 for a gate nothing declares; repo names match whatever their case; it allows the action, with a note, when no item matches or the check cannot run. --branch defaults to the branch checked out, --repo to the name the project gives the repo checked out (otea repos list), refused when the project does not know it; --claude-hook reads a Claude Code PreToolUse event on stdin and refuses with exit 2',
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
      const named = input.option('branch');
      result = withProject(cwd, (project) => {
        const branches = named === '' ? commandBranches(cwd, event.command) : [named ?? ''];
        const fields = branches.map((branch) => gateFields(input, cwd, project, () => branch));
        return checkBranches(project, gate, fields);
      });
    } catch (error) {
      if (error instanceof UsageError) throw error;
      if (error instanceof UntoldTarget) {
        const why = `${gate} refused: cannot tell which branches the command writes to (${error.message}); name them in it`;
        input.warn(why);
        return { data: { gate, allowed: false, items: [] }, text: '', failure: 'hook_refused' };
      }
      // Inside a project, a repo it cannot match could be any of its repos: refused, not allowed.
      if (error instanceof UnknownRepo) {
        input.warn(`${gate} refused: ${error.message}`);
        const failure = hook ? 'hook_refused' : 'gate_refused';
        return { data: { gate, allowed: false, items: [] }, text: '', failure };
      }
      // A field or a gate nothing names is a typo in the call, never a reason to allow the action.
      if (error instanceof OteaError && error.code === 'invalid_fields')
        throw new UsageError(error.message);
      if (error instanceof OteaError && error.code === 'invalid_gate') throw error;
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
  reposList,
  reposAdd,
  reposRemove,
  migrateCommand,
  connect,
  collectionIconCommand,
  create,
  list,
  show,
  boardAdd,
  boardDraft,
  board,
  brief,
  events,
  wait,
  claim,
  heartbeat,
  release,
  update,
  attach,
  link,
  unlink,
  next,
  handoffCommand,
  dropCommand,
  approveCommand,
  sendBack,
  move,
  relay,
  validate,
  check,
  hookInstall,
  hookRemove,
  serve,
  open,
  devicesList,
  devicesRevoke,
  mcp,
];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
