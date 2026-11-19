import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { renderUnicodeCompact } from 'uqr';
import {
  draftToStartFrom,
  proposeAgentDraft,
  type Submitted,
  submitAgentDraft,
} from '../app/agent-draft.ts';
import { promptFacts, promptKindOf } from '../app/agent-prompts.ts';
import {
  type AgentsMdAction,
  assertPinned,
  MCP_SERVER,
  type McpEntry,
  mcpEntry,
  oldMcpEntry,
  writeAgentsMd,
} from '../app/agents.ts';
import { addBoard, addBoardSet, type BoardRecord, syncBoardPresets } from '../app/boards.ts';
import { briefFor } from '../app/brief.ts';
import {
  collectionIcon,
  getCollection,
  presetOf,
  setCollectionIcon,
  typeOfItem,
} from '../app/collections.ts';
import { cropNote } from '../app/crop.ts';
import { listDevices, revokeDevice } from '../app/devices.ts';
import { handInText } from '../app/draft-request.ts';
import { listEvents } from '../app/events.ts';
import { attachEvidence, detachEvidence } from '../app/evidence.ts';
import { type Brings, checkGate, type GateCheck, protectedBases } from '../app/gates.ts';
import { boardGuide, type Guide, guideIndex, hintFor } from '../app/guide.ts';
import {
  forgetProjectPath,
  listProjects,
  oteaHome,
  relinkProjectPath,
  withRegistry,
} from '../app/home.ts';
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
  systemClock,
  updateItem,
} from '../app/items.ts';
import { keepWaitingCommand, keepWaitingLine, waitAgainLine } from '../app/keep-waiting.ts';
import { oteaLauncher, withHome } from '../app/launcher.ts';
import { claimItem, heartbeatItem, releaseItem } from '../app/leases.ts';
import { openMachine, rememberLocalProject, withMachine } from '../app/machine.ts';
import { markMerged, reopenItem } from '../app/merged.ts';
import { type MigrationReport, migrateToCommon } from '../app/migrate.ts';
import {
  approveItem,
  type BoardMoveInput,
  type BoardMoveResult,
  createdTextOf,
  dropItem,
  handoffItem,
  liveBoardOf,
  liveBoards,
  mergeFirstFor,
  nextFor,
  offerableTo,
  rowFactsOf,
  sendBackItem,
} from '../app/next.ts';
import { agentNotes, noteWaiting, replyNote, roundNotesOf } from '../app/notes.ts';
import { performanceOf } from '../app/performance.ts';
import { lanOpen, type Probe, type TransportKind } from '../app/phone.ts';
import {
  claimName,
  endListening,
  endWaiting,
  type Harness,
  hearAgent,
  LISTEN_BEAT_MS,
  listAgents,
  nameFor,
  seeAgent,
  waitBeat,
} from '../app/presence.ts';
import { priorityOf } from '../app/priority.ts';
import {
  declareProfile,
  presetProfile,
  profileCommand,
  profileReminder,
  requireProfile,
} from '../app/profile.ts';
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
import { type ProofSource, tickPoint } from '../app/proofs.ts';
import { answerWaiting, askedByAgent, askQuestion, wakesWhileAsking } from '../app/questions.ts';
import { readerFilter } from '../app/reader-filter.ts';
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
import type { TailscaleCli } from '../app/tailscale.ts';
import {
  addTopic,
  answerTopic,
  closeTopic,
  linkTopic,
  listTopics,
  noteTopic,
  requireTopic,
  requireTopicsOn,
  setTopicsOn,
  topicsAwaiting,
  topicsAwaitingText,
  topicsListText,
  topicsOn,
  topicText,
  topicWaiting,
} from '../app/topics.ts';
import { validateProject } from '../app/validate.ts';
import { watch } from '../app/watch.ts';
import { agentGuideFor, TOPICS_REMINDER, TOPICS_RULE } from '../core/agent-guide.ts';
import { agentPrompt, isPromptKind, PROMPT_KINDS, type PromptKind } from '../core/agent-prompts.ts';
import { isClosed, positionOf } from '../core/board/engine.ts';
import { guardedBranch, stepById } from '../core/board/model.ts';
import { DROPPED_NAME } from '../core/board/next.ts';
import { fieldsByName, stateName } from '../core/board/reading.ts';
import type { Lang } from '../core/board/template-words.ts';
import { isSetKey, LANGS, LISTED_KEYS, TEMPLATE_SETS, TEMPLATES } from '../core/board/templates.ts';
import { parseDiagram } from '../core/diagram.ts';
import { OteaError } from '../core/errors.ts';
import { EVIDENCE_ROLES, type EvidenceRole, MAX_EVIDENCE_MB } from '../core/evidence.ts';
import type { FieldValues } from '../core/fields.ts';
import { assertIconName } from '../core/icons.ts';
import { type Actor, assertAgentName } from '../core/item.ts';
import { parseDuration } from '../core/lease.ts';
import { profileLine } from '../core/profile.ts';
import { describeRelation, RELATION_KINDS } from '../core/relations.ts';
import { timeText } from '../core/time.ts';
import { TURNS, type Turn } from '../core/workflow.ts';
import { DEFAULT_PORT } from '../server/hosts.ts';
import { machineProjects } from '../server/hub.ts';
import { formatCode } from '../server/lan.ts';
import { ensureVapidKeys } from '../server/push.ts';
import { ensureUiToken, readUiToken } from '../server/token.ts';
import {
  type EventFilter,
  findAgent,
  findProfile,
  markMcpAsked,
  type ProfileView,
  profileView,
} from '../store/queries.ts';
import {
  type Command,
  CommandFailure,
  failureCode,
  type Input,
  type Output,
  UsageError,
} from './command.ts';
import { installForge, removeForge } from './forge.ts';
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
import { prState } from './gh.ts';
import {
  branchesBrought,
  checkoutRoot,
  commitsOver,
  currentBranch,
  inMainCheckout,
  pushState,
  remoteOf,
  tipOf,
} from './gitrepo.ts';
import {
  gitHookOf,
  type HookChange,
  installGitHook,
  removeClaudeHook,
  removeGitHook,
} from './hooks.ts';
import { mergedOutsideLine } from './merged-outside.ts';
import { boardsOf, eventData, itemCollections, itemData, readableEvent } from './names.ts';
import { watchOwner } from './owner.ts';
import { PHONE_COMMANDS } from './phone.ts';
import { portFrom, portToOpen, projectPage } from './ports.ts';
import { probeSignIn } from './probe.ts';
import { readServeFile, removeServeFile, writeServeFile } from './serve-file.ts';
import { statsText } from './stats.ts';

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

function itemResult(project: Project, item: Item): Output {
  return {
    data: itemData(project, item),
    text: formatItem(readable(project, item), typesShown(project)),
  };
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
  // A drop with each motive is a state of its own, all named Dropped: said once, with the motives.
  const motives = def.drop.motives.map(({ name }) => name);
  const moves = (list: ItemView['transitions']) => {
    const said = new Map<string, ItemView['transitions'][number] & { motives?: string[] }>();
    for (const move of list) {
      const to = named(move.to);
      if (said.has(to)) continue;
      const drop = to === DROPPED_NAME && motives.length > 0;
      said.set(to, { ...move, to, ...(drop ? { motives } : {}) });
    }
    return [...said.values()];
  };
  const partName = (ref: unknown) => def.parts[String(ref)]?.name ?? String(ref);
  if (view.transitions) out.transitions = moves(view.transitions);
  if (view.relayable) out.relayable = moves(view.relayable);
  if (view.missing) out.missing = view.missing.map(partName);
  if (view.evidence)
    out.evidence = view.evidence.map((entry) =>
      entry.module === null ? entry : { ...entry, module: partName(entry.module) },
    );
  if (view.events) out.events = view.events.map((event) => readableEvent(def, event));
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
function seen(project: Project, input: Input, actor: Actor = input.actor): void {
  const { channel, harness, newSession } = input;
  if (actor.kind !== 'agent') return;
  // Through an MCP server the agent is connected: the open server is listening for it.
  const note = channel === 'mcp' ? hearAgent : seeAgent;
  note(project.db, {
    agent: actor.name,
    channel,
    harness,
    folder: input.cwd,
    ...(newSession ? { newSession } : {}),
  });
}

// Opens the project for a command an agent runs, noting the agent as seen first.
// An agent's write: refused when the agent is pinned to another project (otea connect).
function withAgent<T>(input: Input, use: (project: Project) => T): T {
  return withProject(input.cwd, (project) => {
    assertPinned(input.pin, project.identity);
    seen(project, input);
    return use(project);
  });
}

// Opens the project for a command that only reads: an agent that gave its name is seen; the person
// reading without one is not.
function withReader<T>(input: Input, use: (project: Project) => T): T {
  return withProject(input.cwd, (project) => {
    seen(project, input, input.reader);
    return use(project);
  });
}

async function withReaderWhile<T>(input: Input, use: (project: Project) => Promise<T>): Promise<T> {
  return withProjectWhile(input.cwd, (project) => {
    seen(project, input, input.reader);
    return use(project);
  });
}

async function withAgentWhile<T>(input: Input, use: (project: Project) => Promise<T>): Promise<T> {
  return withProjectWhile(input.cwd, (project) => {
    assertPinned(input.pin, project.identity);
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

const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;

// Each template key with what it makes, for the help of the commands that take one.
const TEMPLATE_LIST = (() => {
  const width = Math.max(...LISTED_KEYS.map((key) => key.length)) + 2;
  const lines = LISTED_KEYS.map((key) => {
    const set = TEMPLATE_SETS.find((candidate) => candidate.key === key);
    const template = set ?? TEMPLATES.find((candidate) => candidate.key === key);
    if (!template) return `  ${key}`;
    const name = set ? `${template.name.en} (a set): ` : '';
    return `  ${key.padEnd(width)}${name}${firstSentence(template.description.en)}`;
  });
  return ['Templates (--template <key>):', ...lines].join('\n');
})();

// What init says to do next: the person opens the desk, which hands them the text for their agent's
// chat; an agent setting the project up connects itself.
export const INIT_NEXT = [
  "Next: otea serve opens the desk, which gives you the text to paste into your agent's chat (otea prompt prints it here).",
  'An agent setting itself up runs otea connect --as <name> --model <id> --effort <level>.',
];

const init: Command = {
  name: 'init',
  summary: `Create or reuse the project at the repository root: in the Otea home ($OTEA_HOME, default ~/.otea), or with --local in .otea at the root; --join <project> links the repo to a registered project instead (refused when a project in a folder above covers it, unless --here); it makes no board unless --template <key> names one, and only on a project with no boards of its own yet: the boards of that template (${TEMPLATE_KEYS}; a set such as ideas or repos makes all of its boards); you can also pick them later in Studio or with otea board add <name> --template <key>; --icon gives the project an icon (without one the UI draws a monogram of its name); --agents-md also adds (or refreshes) a block in AGENTS.md telling agents to run "otea next" and "otea board"`,
  details: TEMPLATE_LIST,
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
      ...(target === undefined
        ? []
        : [`Linked ${root} to the project ${shown.name} (${shown.id})`]),
      `Project data in ${path}`,
      ...(made.length > 0 ? [boardsText(made)] : []),
      ...(kept
        ? [
            `The project already has boards; add one with otea board add <name> --template ${template}`,
          ]
        : []),
    ];
    if (!flag('agents-md')) return { data, text: [...lines, ...INIT_NEXT].join('\n') };
    const agentsMd = writeAgentsMd(root);
    const text = [...lines, AGENTS_MD_TEXT[agentsMd.action](agentsMd.path), ...INIT_NEXT];
    return { data: { ...data, agentsMd }, text: text.join('\n') };
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
  summary:
    'Show the project this folder resolves to: id, name, storage, folder, data folder and the Otea home whose server serves it',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const data = withProject(cwd, ({ identity, storage, root, dataDir }) => ({
      ...identity,
      storage,
      root,
      dataDir,
      home: oteaHome(),
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
    'Move the local project (.otea/) into common storage in the Otea home, verified, keeping the old folder as a backup; refused while otea serve runs on this computer',
  args: [],
  options: { to: { required: true, choices: ['common'] } },
  execute: ({ cwd, required }) => {
    required('to');
    withProject(cwd, () => undefined);
    const server = readServeFile(oteaHome());
    if (server && processAlive(server.pid)) {
      throw new OteaError(
        'in_use',
        `otea serve (pid ${server.pid}, port ${server.port}) holds the project's database; stop it first`,
      );
    }
    const report = migrateToCommon(cwd);
    return { data: report, text: migrationText(report) };
  },
};

// How what Otea writes (hooks, the MCP server connect prints) runs this Otea again: a checkout on
// Node, the desktop app on its own Electron. connect prefers the otea command on $PATH.
const OTEA = oteaLauncher(fileURLToPath(new URL('./main.ts', import.meta.url)), {
  execPath: process.execPath,
  electron: process.versions.electron,
});

// The MCP server as an agent adds it to its own harness's config: every harness keeps that config
// its own way, so Otea gives one instruction and writes none of them.
function mcpInstructionText(entry: McpEntry): string[] {
  const env = Object.entries(entry.env ?? {}).map(([name, value]) => `${name}=${value}`);
  const json = JSON.stringify({ [MCP_SERVER]: entry });
  return [
    "To use Otea's MCP tools, add this MCP server to your harness's MCP config yourself, for this project only: in the project's own config file or your harness's project scope. Never edit your user or global config: the server is pinned to this project. It is a local stdio server; Otea writes no harness config:",
    indent(
      columns([
        ['name', MCP_SERVER],
        ['command', entry.command],
        ['args', entry.args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ')],
        ...(env.length > 0 ? [['env', env.join(' ')]] : []),
      ]),
    ),
    `As JSON: ${json}`,
    "That JSON is one shape; every harness has its own, and may skip a server in another shape without a word: translate it to your harness's schema, or add the server with your harness's own mcp add command, at project scope. The usual project files, as examples: Claude Code: .mcp.json (under mcpServers); OpenCode: opencode.json (under mcp, with command as one array of the command and its args, and env as environment).",
    'It names no agent: each session names itself (--as; MCP tools: as). If your harness already has a server named otea that runs anything else (an older Otea, or mcp --as <name>), replace it for this project with this one. Then restart or reload your session if your harness needs it to load the server, approve it if your harness asks, and call any Otea tool. Until then, and whenever MCP is off, the otea command does the same.',
    'Run otea connect --check now (with --as <name>), and again after that call: only it tells whether the server loaded, and the desk warns until it does.',
  ];
}

// What otea connect --check says: whether the agent named (or any agent) was heard through Otea's
// MCP server in this project.
function mcpCheck(project: Project, agent: string | undefined, now = systemClock): Output {
  const heard = listAgents(project.db, now)
    .filter(({ name, mcpAt }) => mcpAt !== null && (agent === undefined || name === agent))
    .sort((a, b) => Date.parse(b.mcpAt ?? '') - Date.parse(a.mcpAt ?? ''));
  const data = {
    connected: heard.length > 0,
    agents: heard.map(({ name, harness, mcpAt }) => ({ name, harness, mcpAt })),
  };
  if (heard.length > 0) {
    const lines = heard.map(
      ({ name, harness, mcpAt }) =>
        `MCP works: ${name} was heard through Otea's MCP server ${timeText(mcpAt ?? '')}${harness ? ` (${harness})` : ''}`,
    );
    return { data, text: lines.join('\n') };
  }
  const who = agent ? `${agent} has not reached` : 'No agent has reached';
  return {
    data,
    text: `${who} Otea through its MCP server in this project yet. If you added the server, restart or reload the session and approve it when your harness asks (declining turns it off for the project), then call any Otea tool, such as next. If Otea tools answer you but this still says so, your harness runs another otea server (an older one, or one started with --as): replace it for this project with the one otea connect prints. Meanwhile the otea command works the same.`,
    failure: 'not_connected',
  };
}

const connect: Command = {
  name: 'connect',
  summary:
    "Connect agents to Otea, the same for every harness: add (or refresh) Otea's block in AGENTS.md and print the MCP server an agent adds to its own harness's config (otea mcp --project <id>: Otea writes no harness config). --as with --model and --effort also declares the profile that agent runs as, and notes it asked for MCP, so the desk warns while its harness never loads the server. --check says whether the agent (--as) or any agent was heard through the MCP server",
  args: [],
  // --as is a global option; it is named here so the usage line shows it.
  options: {
    as: { placeholder: 'name' },
    model: { placeholder: 'id' },
    effort: { placeholder: 'level' },
    harness: { placeholder: 'name' },
    check: { flag: true },
  },
  execute: async (input) => {
    const { cwd, option, flag } = input;
    const name = input.agent;
    if (name !== undefined) assertAgentName(name);
    if (flag('check')) return withProject(cwd, (project) => mcpCheck(project, name));
    const model = option('model');
    const effort = option('effort');
    const { root, id } = withProject(cwd, (project) => {
      if (name !== undefined) {
        if (model !== undefined && effort !== undefined) {
          presetProfile(project.db, {
            agent: name,
            model,
            effort,
            given: option('harness') ?? 'cli',
          });
        } else if (!findProfile(project.db, name)) {
          throw new UsageError(
            `Give the profile ${name} runs as: --model <id> --effort <level>, exactly as its harness names them (such as claude-opus-5-5 and high)`,
          );
        }
        markMcpAsked(project.db, name, systemClock());
      }
      return { root: project.root, id: project.identity.id };
    });
    // AGENTS.md goes in the checkout the agent works in: a linked worktree's own, so its agents
    // read it there.
    const here = checkoutRoot(cwd) ?? root;
    const agentsMd = writeAgentsMd(here);
    const entry = mcpEntry(withHome(input.oteaOnPath?.() ?? OTEA, input.home), id);
    const mcp = { name: MCP_SERVER, ...entry };
    const old = oldMcpEntry(here);
    const text = [
      `${AGENTS_MD_TEXT[agentsMd.action](agentsMd.path)}: every agent that reads AGENTS.md finds Otea there (if your harness doesn't read AGENTS.md, import it from the file it reads)`,
      ...mcpInstructionText(entry),
      ...(old
        ? [
            `${old} still has the otea entry an older otea connect wrote, which gives every session there one agent name: remove that entry and add the server as above.`,
          ]
        : []),
    ];
    return {
      data: { agentsMd, mcp, ...(name === undefined ? {} : { agent: name }) },
      text: text.join('\n'),
    };
  },
};

// `default` is no icon name, so it can stand for going back to the preset's icon.
const DEFAULT_ICON = 'default';

const collectionIconCommand: Command = {
  name: 'collection icon',
  summary: `Give a collection its own icon, or "${DEFAULT_ICON}" to go back to the icon it came with`,
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
      text: `Collection "${collection.name}" shows icon ${collection.icon ?? 'none'}${own}`,
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
    from: { placeholder: 'topic' },
  },
  execute: (input) => {
    const collection = input.required('collection');
    const type = input.option('type');
    const title = input.required('title');
    const parent = input.option('parent');
    const from = input.option('from');
    const fields = fieldsFrom(input);
    const { actor, channel } = input;
    return withAgent(input, (project) => {
      // The topic the item comes from, checked before anything is made.
      const topic = from === undefined ? undefined : requireTopic(project, from);
      const item = createItem(project, {
        collection,
        ...(type === undefined ? {} : { type }),
        title,
        fields,
        ...(parent === undefined ? {} : { parent }),
        actor,
        channel,
      });
      if (topic) linkTopic(project, { id: topic.id, item: item.id, via: 'from' });
      // On a board: where it starts, and why when its first step was skipped or lacks something.
      return { data: itemData(project, item), text: createdTextOf(project, item) ?? item.id };
    });
  },
};

function listFilter({ option, options, flag, reader }: Input): ListItemsFilter {
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
  if (flag('unclaimed')) filter.availableTo = reader.name;
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
    'List items in creation order, with the order the person set beside those it places (on top 1, order 2: what they put on top and fixed on the Matrix, as otea next takes them), optionally filtered; --unclaimed hides items others hold, --parent keeps the children of an item, --field key=value (repeatable) keeps items whose field holds exactly that value; --state and --field take the board names (any case) or ids',
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
    return withReader(input, (project) => {
      // A step and fields named as the board names them, or by id: each item on its own board.
      const filter = listFilter(input);
      const { state: _state, fields: _fields, ...stored } = filter;
      const items = listItems(project, stored).filter(readerFilter(project, filter));
      // Done with its branch not merged yet reads as the desk says it, never as merged (P6-R2-11).
      const boards = liveBoards(project);
      const shown = items.map((item) => {
        const named = readable(project, item);
        return rowFactsOf(project, item, boards).merge === 'waiting'
          ? { ...named, state: `${named.state}, not merged` }
          : named;
      });
      const boardOf = boardsOf(project);
      // The person's order beside each item it places, as otea next takes them.
      const order = priorityOf(project.db);
      return {
        data: items.map((item) => {
          const placed = order.get(item.id);
          const data = itemData(project, item, boardOf);
          return placed && Object.keys(placed).length > 0 ? { ...data, priority: placed } : data;
        }),
        text: formatItems(shown, typesShown(project), order),
      };
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
    const { reader: actor, channel } = input;
    const performer = { actor, channel };
    return withReader(input, (project) => {
      const shown = showItem(project, id, performer);
      const gitHook = gitHookOf(project, shown);
      // Each event's profile is left to otea events: show stays within its token budget.
      const item = {
        ...shown,
        events: shown.events.map(({ profile: _profile, ...event }) => event),
        hint: hintFor(project, shown, actor.name),
        ...(gitHook === undefined ? {} : { gitHook }),
      };
      const { layout } = typeOfItem(project, shown);
      const named = liveBoardOf(project, item.collection) !== undefined;
      // Evidence is grouped by the module id it went to: its part name would match no module.
      const text = formatItemWithEvents(
        { ...readable(project, item), evidence: item.evidence },
        layout,
        typesShown(project),
        named,
      );
      // The person's notes of this round, as data too: the text has them in its Next: block.
      const notes = roundNotesOf(project, item.id);
      const data = itemData(project, item);
      const outside = mergedOutsideLine(project, input.cwd, shown);
      const said =
        outside === undefined
          ? text
          : `${outside}

${text}`;
      return { data: notes.length === 0 ? data : { ...data, notes }, text: said };
    });
  },
};

// otea board text opens with Otea's agent guide; --json keeps the board's data alone.
const withAgentGuide = (project: Project, text: string) => `${agentGuideFor(topicsOn(project))}

${text}`;

function guideText(project: Project, guide: Guide): string {
  return withAgentGuide(project, guide.text);
}

// --lang (checked against LANGS as the option's choices), the project's language without it.
const langOption = (given: string | undefined): Lang =>
  given === undefined ? PROJECT_LANG : (given as Lang);

const boardName = (record: BoardRecord) => (record.live ?? record.draft)?.definition.name ?? '';

const boardAdd: Command = {
  name: 'board add',
  summary: `For the person, with no agent name: make a board and publish it, from a template (${TEMPLATE_KEYS}) or blank, in the project's language (es) or the one --lang gives; --item names what each item is; a set such as ideas or repos makes all of its boards, the name and --item naming the first; --prefix chooses how its item ids start (2 to 6 letters or digits; one board only)`,
  details: TEMPLATE_LIST,
  args: ['name'],
  options: {
    template: { placeholder: 'key' },
    item: {},
    lang: { choices: LANGS },
    prefix: { placeholder: 'letters' },
  },
  execute: ({ cwd, args: [name = ''], option, agent }) => {
    const lang = langOption(option('lang'));
    // Publishing is the person's: an agent that names itself proposes the board instead.
    if (agent !== undefined) {
      throw new OteaError(
        'forbidden',
        `otea board add publishes a board as the person. An agent proposes one for the person to publish in Studio: otea board draft --new "${name.trim()}" --why "<what it is for>" --as ${agent}`,
      );
    }
    const template = option('template');
    const item = option('item');
    const prefix = option('prefix');
    if (template !== undefined && isSetKey(template)) {
      if (prefix !== undefined)
        throw new UsageError(
          `--prefix names the ids of one board, and ${template} makes several: add it without --prefix`,
        );
      const boards = withProject(cwd, (project) =>
        addBoardSet(project, {
          set: template,
          lang,
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
        lang,
        by: { kind: 'human', name: 'human' },
        ...(template === undefined ? {} : { template }),
        ...(item === undefined ? {} : { item }),
        ...(prefix === undefined ? {} : { prefix }),
      }),
    );
    const ids = added.record.collection
      ? withProject(
          cwd,
          (project) => getCollection(project.db, added.record.collection ?? '').prefix,
        )
      : '';
    const from = template === undefined ? 'blank' : `from template ${template}`;
    return {
      data: added,
      text: `Published board "${name.trim()}" v${added.version} ${from} (ids ${ids}-<n>)`,
    };
  },
};

function draftFile(cwd: string, file: string): string {
  const path = resolve(cwd, file);
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new OteaError('file_not_found', `No file at ${path}`);
  }
}

function handedInLines(id: string, submitted: Submitted): string[] {
  return [
    `Handed in the board draft on ${id} (evidence ${submitted.evidence.id}); it is in Studio now, for the person to try and publish.`,
    ...(submitted.notes.length === 0
      ? []
      : ["Read as today's board:", ...submitted.notes.map((n) => `  ${n}`)]),
    ...(submitted.problems.length === 0
      ? []
      : ['Still to fix, for it to be published:', ...submitted.problems.map((p) => `  ${p}`)]),
  ];
}

// The board's page in Studio, on the port otea serve runs on (or would).
function studioLink(project: Project, board: string): string {
  const page = projectPage(portToOpen(undefined), project.identity.id);
  return `${page}#/studio/board/${encodeURIComponent(board)}`;
}

// otea board draft --new: the agent the person asked for a board starts it; the person publishes.
function proposeBoard(input: Input, name: string): Output {
  const why = input.option('why')?.trim() ?? '';
  const file = input.option('file');
  const template = input.option('template');
  return withAgent(input, (project) => {
    if (why === '')
      throw new OteaError('missing_fields', 'Say what the board is for: --why "<what it is for>"');
    const text = file === undefined ? undefined : draftFile(input.cwd, file);
    const { actor, channel } = input;
    const made = proposeAgentDraft(project, {
      name,
      need: why,
      lang: PROJECT_LANG,
      actor,
      channel,
      ...(text === undefined ? {} : { text }),
      ...(template === undefined ? {} : { template }),
    });
    const studio = studioLink(project, made.board.id);
    const lines = [
      ...(made.submitted ? handedInLines(made.item, made.submitted) : []),
      `The board "${name.trim()}" waits in Studio for the person to try and publish, on the Pedido ${made.item} you hold: ${studio}`,
      ...(made.others.length === 0
        ? []
        : [
            `Made with it, from the same template, as drafts the person publishes together with it: ${made.others.map((record) => `"${boardName(record)}"`).join(', ')}`,
          ]),
      ...(made.submitted ? [] : [handInText(made.item)]),
    ];
    return { data: { ...made, studio }, text: lines.join('\n') };
  });
}

const boardDraft: Command = {
  name: 'board draft',
  summary:
    'Draft the board a Pedido asks for: without --file, print the draft to start from (JSON); with --file, check it as a board and hand it in on the Pedido as board.json, saying what is still wrong (the board keeps the name it was asked for; the name in the file is not used). To propose a new board the person asked you for, --new <name> --why "<what it is for>" (and --template <key> to start from a catalogue board, or from a set such as ideas or repos, which makes its other boards with it; --file to hand it in at once) makes it and its Pedido, which you hold; the person publishes it in Studio',
  details: TEMPLATE_LIST,
  args: ['id?'],
  options: {
    file: { placeholder: 'board.json' },
    new: { placeholder: 'name' },
    why: { placeholder: 'what it is for' },
    template: { placeholder: 'key' },
  },
  execute: (input) => {
    const [id] = input.args;
    const name = input.option('new');
    if (name !== undefined && id !== undefined)
      throw new UsageError('Give the Pedido or --new <name>, not both');
    if (name !== undefined) return proposeBoard(input, name);
    if (id === undefined) throw new UsageError('Give the Pedido, or --new <name> for a new board');
    if (input.option('why') !== undefined) throw new UsageError('--why goes with --new <name>');
    if (input.option('template') !== undefined)
      throw new UsageError('--template goes with --new <name>');
    const file = input.option('file');
    return withAgent(input, (project) => {
      if (file === undefined) {
        const definition = draftToStartFrom(project, id);
        return { data: definition, text: JSON.stringify(definition, null, 2) };
      }
      const text = draftFile(input.cwd, file);
      const { actor, channel } = input;
      const submitted = submitAgentDraft(project, { id, text, actor, channel });
      return { data: submitted, text: handedInLines(id, submitted).join('\n') };
    });
  },
};

// otea prompt: what the person pastes into an agent's chat, as the UI copies it. With no moment it
// picks the project's: the first contact where there is no project or no board of its own, the
// join prompt (written from the project as it is now) once there are boards.
function projectPrompt(cwd: string, kind: PromptKind | undefined, lang: Lang): string {
  const empty = { boards: [], working: [] };
  let project: Project;
  try {
    project = openProject(cwd);
  } catch (error) {
    if (error instanceof OteaError && error.code === 'not_found' && kind !== 'join')
      return agentPrompt(kind ?? 'start', lang, empty);
    throw error;
  }
  try {
    const moment = kind ?? promptKindOf(project);
    return agentPrompt(moment, lang, promptFacts(project, moment));
  } finally {
    project.db.close();
  }
}

const promptCommand: Command = {
  name: 'prompt',
  summary:
    "Print what to paste into an agent's chat: start (a new project: set up, connect, read the project, interview you one question at a time and draft its boards), join (one more agent working the boards there are, named from the project now) or design (one more board); without one, start until the project has boards of its own, then join. --lang en|es (default es)",
  args: ['moment?'],
  options: { lang: { placeholder: 'en|es' } },
  execute: (input) => {
    const [moment] = input.args;
    if (moment !== undefined && !isPromptKind(moment))
      throw new UsageError(`The moment is one of ${PROMPT_KINDS.join(', ')}`);
    const lang = input.option('lang') ?? 'es';
    if (lang !== 'en' && lang !== 'es') throw new UsageError('--lang is en or es');
    const text = projectPrompt(input.cwd, moment as PromptKind | undefined, lang);
    return { data: { prompt: text }, text };
  },
};

const board: Command = {
  name: 'board',
  summary:
    'Print what agents read about a board before acting: its own words for them and each step\'s instructions; without a name, the project\'s boards and how to read each. To propose a new board, otea board draft --new "<name>" --why "<what it is for>"; the person publishes it in Studio',
  args: ['name?'],
  options: {},
  execute: (input) => {
    const [name = ''] = input.args;
    return withReader(input, (project) => {
      if (name !== '') {
        const guide = boardGuide(project, name);
        return { data: guide, text: guideText(project, guide) };
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
      return { data: { boards }, text: withAgentGuide(project, index) };
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

// The guide's topics rule without its number, nor its opening (next and wait say it their way).
const TOPICS_TEXT = TOPICS_RULE.replace(/^\d+\. Topics are on\. /, '');

// What otea wait woke an agent for, with the topics reminder while topics are on: an agent in a
// chat reads it between the person's messages, where side questions come.
function withTopicsReminder(project: Project, actor: Actor, output: Output): Output {
  if (actor.kind !== 'agent' || !topicsOn(project)) return output;
  const data =
    output.data !== null && typeof output.data === 'object'
      ? { ...(output.data as object), reminder: TOPICS_REMINDER }
      : output.data;
  return { ...output, data, text: `${output.text}\n\n${TOPICS_REMINDER}` };
}

// While topics are on, next names the topics waiting for the agent's answer (a note otea wait woke
// it for is still there once it runs next) and the topics rule, which an agent whose session began
// before the person turned topics on never read in its guide.
function topicLines(project: Project, agent: string): string[] {
  if (!topicsOn(project)) return [];
  const awaiting = topicsAwaitingText(topicsAwaiting(project, agent));
  const rule = `Topics are on. ${TOPICS_TEXT}`;
  return awaiting === undefined ? [rule] : [awaiting, rule];
}

const next: Command = {
  name: 'next',
  summary:
    'Say which item to take now on the published boards (or in --collection), oldest first, and what its step asks: what it starts with, the instructions, the handoff and where it goes next; when there is none, what to do meanwhile. Never offers an item another agent holds or was just offered; --claim also claims it in the same call',
  args: [],
  options: { collection: {}, claim: { flag: true } },
  execute: (input) => {
    const collection = input.option('collection');
    const claim = input.flag('claim');
    const { actor, channel } = input;
    return withAgent(input, (project) => {
      const profile = requireProfile(project.db, actor.name, { channel, confirmed: true });
      const answer = nextFor(project, actor.name, {
        ...(collection === undefined ? {} : { collection }),
        ...(claim ? { claim } : {}),
      });
      const offered = answer.item === null ? undefined : getItem(project, answer.item);
      const outside = offered && mergedOutsideLine(project, input.cwd, offered);
      // Offered work in the shared main checkout says so before the agent starts (P6-R2-3).
      const shared = offered && sharedCheckoutLine(project, input, offered.id);
      // It always ends with the exact command to keep waiting: told only to wait, agents ended
      // their turn, and the person's answer on the desk went unheard.
      const text = [
        ...(outside ? [outside] : []),
        answer.text,
        ...(shared ? [shared] : []),
        ...topicLines(project, actor.name),
        profileReminder(profile, actor.name, channel),
        keepWaitingLine(actor.name, channel, { idle: answer.idle === true, collection }),
      ].join('\n\n');
      return { data: { ...answer, text, profile: profileView(profile) }, text };
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
    return { data: { item: itemData(project, item), text }, text };
  });
}

// A step that hands a branch hands the work on it: an agent's handoff of one with no commits over
// its base (the board's protected base, else origin's default branch, main or master) leaves the
// review nothing to see. Only a branch this checkout has, here or on origin, is checked.
function refuseEmptyBranch(project: Project, cwd: string, move: BoardMoveInput): void {
  if (move.actor.kind !== 'agent' || move.way !== undefined) return;
  const item = getItem(project, move.id);
  const board = liveBoardOf(project, item.collection);
  const position = positionOf(item.state);
  if (!board || isClosed(position) || position.phase !== 'doing') return;
  const step = stepById(board.def, position.step);
  for (const hand of step?.hand ?? []) {
    const part = board.def.parts[hand.ref];
    const branch = part?.kind === 'branch' ? item.fields[part.id] : undefined;
    if (!part || hand.req === 'no' || typeof branch !== 'string' || branch.trim() === '') continue;
    const base = part.guard?.base;
    const bases = [...(base ? [base, `origin/${base}`] : []), 'origin/HEAD', 'main', 'master'];
    const over = commitsOver(cwd, branch.trim(), bases);
    if (over?.count !== 0) continue;
    throw new OteaError(
      'missing_fields',
      `${item.id} not handed off: ${part.name} ${branch.trim()} has no commits over ${over.base}, so the review would find nothing in it. Commit your work on ${branch.trim()}, then hand it off again.`,
    );
  }
}

// The protected branch as git has it here when a step that pushes or hands it is handed off: kept
// with a handoff into a review, it is what the person approves, and all the push gate lets land
// once it is approved (P3C-R2-1). Before the branch freezes in review, an agent's handoff is
// refused when the branch it names is not here at all (P1-R2-2), or when it holds commits the
// remote branch of its name never got, on a step that pushes it (P3C-R2-2); one never pushed
// though the repo has a remote is handed off with a warning, and the person sees it when they
// approve (P7-8). The base itself, on a board that works straight on it, is never pushed before
// the approval.
function handedBranch(
  project: Project,
  cwd: string,
  move: BoardMoveInput,
): { tip?: NonNullable<BoardMoveInput['tip']>; warning?: string } {
  const item = getItem(project, move.id);
  const board = liveBoardOf(project, item.collection);
  const position = positionOf(item.state);
  const guard = board && guardedBranch(board.def);
  if (!guard || isClosed(position) || position.phase !== 'doing') return {};
  // A step that pushes the branch, or that hands it in (on main, the work is committed, not pushed,
  // before the approval).
  const pushes = guard.guard.push.includes(position.step);
  const hands = stepById(board.def, position.step)?.hand.some(({ ref }) => ref === guard.id);
  if (!pushes && !hands) return {};
  const branch = String(item.fields[guard.id] ?? '').trim();
  if (branch === '') return {};
  const base = branch === guard.guard.base;
  const checked = move.actor.kind === 'agent' && move.way === undefined && !base;
  const state = checked ? pushState(cwd, branch) : undefined;
  const frozen = `once handed off, ${guard.name} is frozen while it is reviewed`;
  if (state?.kind === 'missing') {
    const on = state.on && state.on !== guard.guard.base ? state.on : '<branch>';
    const where = state.on ? ` (you are on ${state.on})` : '';
    throw new OteaError(
      'missing_fields',
      `${item.id} not handed off: ${guard.name} names ${branch}, a branch this checkout has neither here nor on the remote${where}. Set ${guard.name} to the branch that holds the work, otea update ${item.id} --field "${guard.name}=${on}", then hand it off again: ${frozen}.`,
    );
  }
  if (state?.kind === 'ahead' && pushes) {
    throw new OteaError(
      'missing_fields',
      `${item.id} not handed off: ${branch} holds commits ${state.remote} never got. Push it first (git push ${state.push} ${branch}), then hand it off again: ${frozen}, so the review would never see them.`,
    );
  }
  const tip = tipOf(cwd, branch, base);
  const unpushed = state?.kind === 'unpushed' && pushes;
  const warning = unpushed
    ? `Note: ${branch} was never pushed to ${state.push}. If the person reviews it on the forge (a pull request), they cannot see it there: ${frozen}.`
    : undefined;
  return {
    ...(tip ? { tip: unpushed ? { ...tip, pushed: false as const } : tip } : {}),
    ...(warning ? { warning } : {}),
  };
}

const handoffCommand: Command = {
  name: 'handoff',
  summary:
    'Hand off the step you did on an item: refused, saying what is missing, until its handoff is complete; then to its review, or along --way (a step name or Done) with --reason when the step has several. --note is the note of the handoff, kept with the round (required where the step asks for one, and after a send-back); --way an earlier step, with --reason, takes the item back to it for its next round; again in review, --note amends it',
  args: ['id'],
  options: { way: { placeholder: 'step' }, reason: {}, note: {} },
  execute: (input) => {
    let warning: string | undefined;
    const moved = boardMove(input, (project, move) => {
      refuseEmptyBranch(project, input.cwd, move);
      const handed = handedBranch(project, input.cwd, move);
      warning = handed.warning;
      return handoffItem(project, { ...move, ...(handed.tip ? { tip: handed.tip } : {}) });
    });
    // An agent goes on to the next item: the reply says so, so it does not stop after one.
    const next =
      input.channel === 'mcp'
        ? 'Next: call next, and keep going until the person stops you.'
        : 'Next: otea next';
    return {
      data: { ...(moved.data as object), next, ...(warning ? { warning } : {}) },
      text: [moved.text, ...(warning ? [warning] : []), next].join('\n'),
    };
  },
};

const dropCommand: Command = {
  name: 'drop',
  summary:
    'Drop an item that is not worth doing, saying why with --reason, and, on a board with motives, which one with --motive (its name); an agent drops only while doing a step that lets it',
  args: ['id'],
  options: { reason: {}, motive: {} },
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, channel, option } = input;
    const reason = option('reason');
    const motive = option('motive');
    const dropping = {
      id,
      actor,
      channel,
      ...(reason ? { reason } : {}),
      ...(motive ? { motive } : {}),
    };
    return withAgent(input, (project) => {
      const { item, text } = dropItem(project, dropping);
      return { data: { item: itemData(project, item), text }, text };
    });
  },
};

const approveCommand: Command = {
  name: 'approve',
  summary: 'Approve the step you review, along --way when it has several; --note for the next step',
  args: ['id'],
  options: { way: { placeholder: 'step' }, note: {} },
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
  options: {
    quote: { required: true, placeholder: 'what the human said' },
    reason: {},
    motive: { placeholder: 'name' },
  },
  execute: (input) => {
    const [id = '', to = ''] = input.args;
    const quote = input.required('quote');
    const reason = input.option('reason');
    const motive = input.option('motive');
    const via = input.actor.name;
    const { channel } = input;
    const relayed = {
      id,
      to,
      via,
      channel,
      quote,
      ...(reason ? { reason } : {}),
      ...(motive ? { motive } : {}),
    };
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
  // After a cursor, --limit pages forward from it; alone, it reads the latest events.
  if (limit !== undefined && since !== undefined) filter.limit = limit;
  if (limit !== undefined && since === undefined) filter.latest = limit;
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
    'Print the event log in commit order, after the event id given to --since; --limit alone prints the latest n, after --since the first n; --follow keeps printing new events until Ctrl+C',
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
    if (follow && (filter.limit ?? filter.latest) !== undefined) {
      throw new UsageError('--limit cannot be combined with --follow');
    }
    await withReaderWhile(input, async (project) => {
      let since = filter.since ?? 0;
      const collectionOf = itemCollections(project);
      const printNew = () => {
        // Read afresh each time: a board published while following names its steps anew.
        const boardOf = boardsOf(project);
        for (const event of listEvents(project, { ...filter, since })) {
          const def = boardOf(collectionOf(event.itemId));
          input.print(eventData(def, event), formatEvent(readableEvent(def, event)));
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

// How each model performs: per model family and effort, from the profile on each handoff.
const stats: Command = {
  name: 'stats',
  summary:
    'Print how each model performs on the boards, per model family and effort (and per exact model and step): handoffs, how many came back, rounds per finished step, items done, discards and the median time from claim to handoff; --since 7d, 30d or all (the default), --board keeps one board. Profiles are as the agents declare them',
  args: [],
  options: { board: {}, since: { placeholder: 'period' } },
  execute: ({ cwd, option }) => {
    const board = option('board');
    const since = option('since') ?? 'all';
    const view = withProject(cwd, (project) => performanceOf(project, { board, since }));
    return { data: view, text: statsText(view, since) };
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
    'Wait until an item is on the turn and print it as a list row, at once if one already is; the one waiting longest in its state comes first. A note from the person on an item you hold, or their answer to your question, wakes it too, saying which',
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
    // A wait whose starter is gone (its agent's session ended) stops: left running it would keep
    // the agent shown as listening until its timeout.
    const owner = watchOwner(input.signal);
    const options = {
      signal: owner.signal,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(filter.availableTo === undefined ? {} : { recheckMs: LEASE_RECHECK_MS }),
    };
    const result = await withAgentWhile(input, async (project) => {
      // A note from the person on an item this agent holds wakes it too: it answers it first. So
      // does the person's answer to its question.
      const me = input.actor.name;
      // An agent waiting for unclaimed agent work wakes only for an item next would offer it: one left for
      // or just offered to another agent would wake it to "nothing to do" again and again.
      const forMe =
        input.actor.kind === 'agent' && turn === 'agent' && filter.availableTo !== undefined;
      // A board the person publishes while it waits joins the catalog before the check reads its
      // items, as the server does on each request; it costs one query when nothing was published.
      const check = () => {
        syncBoardPresets(project);
        return lookFor();
      };
      // Topics the person turns on while an agent waits wake it once with their rule: its session
      // began without it, and an agent at work reads it in next.
      const topicsBefore = topicsOn(project);
      const topicsTurnedOn = () =>
        input.actor.kind === 'agent' && !topicsBefore && topicsOn(project)
          ? { topics: 'on', text: `The person turned topics on. ${TOPICS_TEXT}` }
          : undefined;
      // An agent waiting on the agent turn while its own question waits for the person waits for
      // the answer, and for its send-backs and new work; work already free when it asked does not
      // wake it (wakesWhileAsking).
      const onItsQuestion = () =>
        input.actor.kind === 'agent' && turn === 'agent' && askedByAgent(project, me).length > 0;
      const keep = () => {
        const offerable = forMe ? offerableTo(project, me) : undefined;
        const asking =
          input.actor.kind === 'agent' && turn === 'agent'
            ? wakesWhileAsking(project, me)
            : undefined;
        if (!asking) return offerable;
        return (item: Item) => asking(item) && (offerable?.(item) ?? true);
      };
      const lookFor = () =>
        topicsTurnedOn() ??
        noteWaiting(project, me) ??
        (input.actor.kind === 'agent' ? topicWaiting(project, me) : undefined) ??
        answerWaiting(project, me) ??
        oldestWaiting(project, filter, undefined, keep());
      // Waiting is listening: the agent is heard as it waits, so it counts as connected and its
      // profile stays confirmed.
      // When it was last heard: a wait whose session ended stops its agent listening at once.
      let heardAt: string | undefined;
      const heard =
        input.actor.kind === 'agent'
          ? waitBeat(project.db, { agent: me, channel: input.channel, harness: input.harness })
          : undefined;
      const beat = heard
        ? {
            beat: {
              everyMs: heard.everyMs,
              run: () => {
                heardAt = heard.run();
              },
            },
          }
        : {};
      // It listens from the start, not from its first beat.
      beat.beat?.run();
      const waited = await watch(project.db, check, { ...options, ...beat }).finally(owner.stop);
      if (owner.orphaned() && heardAt) endListening(project.db, me, heardAt);
      // It waits no more once it found something or was stopped; a timeout is called again at once.
      const timedOut = !('found' in waited) && waited.stopped === 'timeout';
      if (heardAt && !timedOut) endWaiting(project.db, me, heardAt);
      if (!('found' in waited)) {
        return { ...waited, asked: onItsQuestion() ? askedByAgent(project, me) : [] };
      }
      const { found } = waited;
      const row = 'text' in found ? { data: found, text: found.text } : itemResult(project, found);
      // A parent whose parts wait to be merged: the merges are what the agent does now.
      const merges = 'text' in found ? undefined : mergeFirstFor(project, found.id);
      const woke = merges === undefined ? row : { ...row, text: `${row.text}\n${merges}` };
      // While topics are on, what woke the agent reminds it to record side questions.
      const reminded = 'topics' in found ? woke : withTopicsReminder(project, input.actor, woke);
      // An agent woken on its turn reads what woke it, then waits again: told so in exact words.
      if (input.actor.kind !== 'agent' || turn !== 'agent') return reminded;
      return {
        ...reminded,
        text: `${reminded.text}\n${waitAgainLine(me, input.channel, filter.collection)}`,
      };
    });
    if ('data' in result) return result;
    if (result.stopped === 'timeout') {
      const asked = result.asked.join(', ');
      const said =
        asked === ''
          ? `No item reached the ${turn} turn within ${timeout}`
          : `The person has not answered your question on ${asked} within ${timeout}`;
      // A timeout is no end of the work: an agent waits again, with the exact command.
      const again =
        input.actor.kind === 'agent' && turn === 'agent'
          ? `; keep waiting: ${keepWaitingCommand(input.actor.name, filter.collection)}`
          : '';
      throw new CommandFailure('timeout', `${said}${again}`);
    }
    if (owner.orphaned()) {
      throw new CommandFailure('interrupted', 'Stopped waiting: the session that started it ended');
    }
    throw new CommandFailure('interrupted', 'Interrupted while waiting');
  },
};

// An agent that claims, or is offered, an item in the repo's main checkout is told to work in its
// own worktree (P1-15, P6-R2-3) while other agents hold work in the project (two agents in one
// checkout change each other's files), or while that checkout sits on another open item's branch
// (switching it here changes that item's work, as Integrar left it twice).
function sharedCheckoutLine(project: Project, input: Input, id?: string): string | undefined {
  if (!inMainCheckout(input.cwd)) return undefined;
  const me = input.actor.name;
  const others = [
    ...new Set(
      listAgents(project.db)
        .filter((agent) => agent.name !== me && agent.holding.length > 0)
        .map(({ name }) => name),
    ),
  ];
  let on: string | undefined;
  try {
    on = currentBranch(input.cwd);
  } catch {}
  const holder = on === undefined ? undefined : openItemOn(project, on, id);
  const lines: string[] = [];
  if (holder && on) {
    lines.push(
      `This is the repository's main checkout, and it is on ${on}, the branch of ${holder}: do ${id ?? 'this item'} in its own git worktree (git worktree add ../<folder> -b <branch>) and leave ${holder}'s branch as it is.`,
    );
  }
  if (others.length > 0) {
    lines.push(
      `${others.join(', ')} also holds work in this project, and you are in the repository's main checkout: do your work on your own branch in your own git worktree (git worktree add ../<folder> -b <branch>), never in files another agent is changing.`,
    );
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

// The open board item, other than `except`, whose protected branch is `branch` (never a base a
// board protects: the base is every item's).
function openItemOn(project: Project, branch: string, except?: string): string | undefined {
  for (const board of liveBoards(project)) {
    const guard = guardedBranch(board.def);
    if (!guard || guard.guard.base === branch) continue;
    const found = listItems(project, { collection: board.collection }).find(
      (item) =>
        item.id !== except &&
        !isClosed(positionOf(item.state)) &&
        String(item.fields[guard.id] ?? '').trim() === branch,
    );
    if (found) return found.id;
  }
  return undefined;
}

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
    return withAgent(input, (project) => {
      requireProfile(project.db, actor.name, { channel: input.channel });
      const claimed = itemResult(project, claimItem(project, lease));
      const shared = sharedCheckoutLine(project, input, id);
      return shared ? { ...claimed, text: `${claimed.text}\n${shared}` } : claimed;
    });
  },
};

// The name a session takes: the one it worked under before here (same folder, same harness, not
// connected now), so it keeps one name across sessions; else a new one, never one connected now.
const whoami: Command = {
  name: 'whoami',
  summary:
    'Say which agent name to use in this session: the one you worked under before from this folder through the same harness (and not connected now), or that you pick a new one, not one of the agents connected now. --harness names the tool you run in (an MCP client names its own)',
  args: [],
  options: { harness: { placeholder: 'name' } },
  execute: (input) => {
    const { cwd, option } = input;
    const client = input.channel === 'mcp' ? input.harness?.name : undefined;
    const harness = option('harness') ?? client;
    return withProject(cwd, (project) => {
      // Over MCP this server asks: a name it hears is this session's own.
      const session = input.channel === 'mcp' ? process.pid : undefined;
      const advice = nameFor(project.db, { folder: cwd, harness, session });
      const others = advice.others.length > 0 ? advice.others : [];
      if (input.agent !== undefined) {
        assertAgentName(input.agent);
        return {
          data: { ...advice, name: input.agent, given: true },
          text: `You are ${input.agent}: put it on every command (--as ${input.agent}; MCP tools: as).`,
        };
      }
      if (advice.name !== null) {
        const known = findAgent(project.db, advice.name);
        const when = known ? ` (last seen ${timeText(known.lastSeen)})` : '';
        return {
          data: { ...advice, reuse: true },
          text: [
            `Reuse your name: ${advice.name}${when}, the agent that worked here before through this harness, with no session working under it now. Put it on every command: --as ${advice.name} (MCP tools: as).`,
            ...(advice.lately
              ? [
                  `${advice.name} acted moments ago: if another terminal still works as ${advice.name}, pick a new name instead.`,
                ]
              : []),
            ...(others.length > 0
              ? [`Others that worked here and are not connected now: ${others.join(', ')}.`]
              : []),
          ].join('\n'),
        };
      }
      const taken =
        advice.working.length > 0
          ? `, not one of the agents connected now (${advice.working.join(', ')})`
          : '';
      return {
        data: { ...advice, reuse: false },
        text: `No earlier session of yours is known here: pick a new short name of your own (lowercase letters, digits and dashes)${taken}, and put it on every command (--as <name>; MCP tools: as).`,
      };
    });
  },
};

// The profile an agent runs as: declared with --model and --effort (--harness too for a
// command-line agent the first time; an MCP client names its own), or shown without them.
const profileCommandSpec: Command = {
  name: 'profile',
  summary:
    'Declare the profile you run as: --model the exact model id and --effort the effort, as your harness names them (such as claude-opus-5-5 and high). Declare only what you can read from your settings; if you cannot know a value, declare unknown. Never guess. --harness the tool you run in, the first time on the command line (an MCP client names its own). Declare it at the start of each session and whenever the model or effort changes; it is kept on everything you do. Without options, shows it',
  args: [],
  options: {
    model: { placeholder: 'id' },
    effort: { placeholder: 'level' },
    harness: { placeholder: 'name' },
  },
  execute: (input) => {
    const { actor, channel, harness, option } = input;
    const model = option('model');
    const effort = option('effort');
    const given = option('harness');
    return withAgent(input, (project) => {
      const known = findProfile(project.db, actor.name);
      if (model === undefined && effort === undefined && given === undefined) {
        if (!known) {
          const text = `${actor.name} has no profile yet: declare it with ${profileCommand(actor.name, channel)}`;
          return { data: { agent: actor.name, profile: null, confirmed: false }, text };
        }
        const view = profileView(known.profile);
        return {
          data: { agent: actor.name, profile: view, confirmed: known.confirmed },
          text: profileText(actor.name, view, known.confirmed, channel),
        };
      }
      const declaredModel = model ?? known?.profile.model;
      const declaredEffort = effort ?? known?.profile.effort;
      if (declaredModel === undefined || declaredEffort === undefined) {
        throw new UsageError('Declare both --model <id> and --effort <level> the first time');
      }
      const declared = declareProfile(project.db, {
        agent: actor.name,
        channel,
        harness,
        model: declaredModel,
        effort: declaredEffort,
        ...(given === undefined ? {} : { given }),
      });
      return { data: declared, text: profileText(actor.name, declared.profile, true, channel) };
    });
  },
};

function profileText(
  agent: string,
  profile: ProfileView,
  confirmed: boolean,
  channel: Input['channel'],
): string {
  const line = `${agent} runs as ${profileLine(profile)} on ${profile.harness} (family ${profile.family})`;
  return confirmed
    ? line
    : `${line}; not confirmed in this session: declare it again with ${profileCommand(agent, channel)}`;
}

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
    return withAgent(input, (project) =>
      withNotes(project, id, itemResult(project, heartbeatItem(project, lease))),
    );
  },
};

// What an agent's answer adds while notes from the person wait for its answer: their block after
// the text, and the notes and that block in the data (`notes`, `text`).
function withNotes(project: Project, id: string, output: Output): Output {
  const waiting = agentNotes(project, id);
  if (!waiting) return output;
  return {
    data: { ...(output.data as Record<string, unknown>), notes: waiting.notes, text: waiting.text },
    text: `${output.text}\n\n${waiting.text}`,
  };
}

const reply: Command = {
  name: 'reply',
  summary:
    'Answer a note the person left while you do a step (--note, its number; next, show and heartbeat print them): a short answer; the step, round and lease stay as they are. A handoff waits until every note of the round is answered',
  args: ['id', 'answer'],
  options: { note: { required: true, placeholder: 'n' } },
  execute: (input) => {
    const [id = '', answer = ''] = input.args;
    const given = input.required('note');
    if (!/^[1-9]\d*$/.test(given)) throw new UsageError('--note must be the number of a note');
    const { actor, channel } = input;
    return withAgent(input, (project) => {
      const replied = replyNote(project, { id, note: Number(given), text: answer, actor, channel });
      return { data: replied, text: replied.text };
    });
  },
};

// The zone of an image a note is on, cut out for an agent that asks for it: the note says the zone
// in percent; this gives its pixels, and for a PNG the pixels themselves in a file.
const crop: Command = {
  name: 'crop',
  summary:
    'Cut out the zone of an image a note of the person is on (--note, its number; a note on a point gives a fifth of the image around it): a PNG is written to a file (--out, or the temp folder) to read as an image; any other image gets the zone in its pixels',
  args: ['id'],
  options: { note: { required: true, placeholder: 'n' }, out: { placeholder: 'file.png' } },
  execute: (input) => {
    const [id = ''] = input.args;
    const given = input.required('note');
    if (!/^[1-9]\d*$/.test(given)) throw new UsageError('--note must be the number of a note');
    const out = input.option('out');
    return withAgent(input, (project) => {
      const cut = cropNote(project, {
        id,
        note: Number(given),
        ...(out === undefined ? {} : { out }),
      });
      return { data: cut, text: cut.text };
    });
  },
};

// That a Done item's branch is in: Done takes no other change, so this is how its page and rows
// learn the work was merged.
const merged: Command = {
  name: 'merged',
  summary:
    "Record that a Done item's branch was merged (--pr, its pull request; --commit, the merge commit), so its page and rows stop saying it waits to be merged",
  args: ['id'],
  options: { pr: { placeholder: 'url' }, commit: { placeholder: 'sha' } },
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, channel } = input;
    const pr = input.option('pr');
    const commit = input.option('commit');
    // With a PR, gh says whether it really merged and which branch: a wrong mark is refused. When
    // gh cannot tell, the mark is kept as given, with a note.
    const forge = pr === undefined ? undefined : prState(input.cwd, pr, input.gh);
    if (pr !== undefined && forge === undefined)
      input.warn(`could not check PR ${pr} with gh; recorded as merged as you said`);
    return withAgent(input, (project) => {
      const done = markMerged(project, {
        id,
        actor,
        channel,
        ...(pr === undefined ? {} : { pr }),
        ...(commit === undefined ? {} : { commit }),
        ...(forge === undefined ? {} : { forge }),
      });
      const said = [done.pr, done.commit].filter(Boolean).join(', ');
      return { data: done, text: `Marked ${id} merged${said ? ` (${said})` : ''}.` };
    });
  },
};

const reopen: Command = {
  name: 'reopen',
  summary:
    'Take a Done, unmerged item back to the step that pushes its branch (its PR conflicts) and through review again',
  args: ['id'],
  options: { reason: { placeholder: 'why its branch must change' } },
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor, channel } = input;
    const reason = input.option('reason') ?? '';
    return withAgent(input, (project) => {
      const { item, text } = reopenItem(project, { id, actor, channel, reason });
      // As any move answers: the item with its fields by name, and what to do now.
      return { data: { item: itemData(project, item), text }, text };
    });
  },
};

// The proof a tick names: an evidence entry (--evidence 3), a log line (--log build.log:212) or a
// test of an attached report (--test "suite › name"); at most one.
function proofSource(option: (name: string) => string | undefined): ProofSource {
  const evidence = option('evidence');
  const log = option('log');
  const test = option('test');
  const given = [evidence, log, test].filter((value) => value !== undefined);
  if (given.length > 1)
    throw new OteaError('invalid_fields', 'Prove a point with one of --evidence, --log or --test');
  if (evidence !== undefined) {
    const n = Number(evidence.replace(/^#/, ''));
    if (!Number.isInteger(n) || n < 1)
      throw new OteaError(
        'invalid_fields',
        '--evidence takes the number of an attached file, such as 3',
      );
    return { evidence: n };
  }
  if (log !== undefined) {
    const at = /^(.+):(\d+)$/.exec(log.trim());
    if (!at?.[1] || !at[2])
      throw new OteaError(
        'invalid_fields',
        "--log takes the log's file name and a line, such as build.log:212",
      );
    return { log: { file: at[1], line: Number(at[2]) } };
  }
  if (test !== undefined) return { test };
  return {};
}

// Ticks a checklist point, with what proves it: Otea checks the log line exists and the test passes.
const tick: Command = {
  name: 'tick',
  summary:
    'Tick a checklist point with its proof: --log file:line, --test "name" (passing, in an attached report) or --evidence n; --part names the checklist',
  args: ['id', 'point'],
  options: {
    part: { placeholder: 'checklist' },
    log: { placeholder: 'file:line' },
    test: { placeholder: 'name' },
    evidence: { placeholder: 'n' },
  },
  execute: (input) => {
    const [id = '', point = ''] = input.args;
    const { actor, channel, option } = input;
    const part = option('part');
    const source = proofSource(option);
    return withAgent(input, (project) => {
      const done = tickPoint(project, {
        id,
        point,
        source,
        actor,
        channel,
        ...(part === undefined ? {} : { part }),
      });
      return withNotes(project, id, { data: done, text: done.text });
    });
  },
};

// An agent's question to the person: the turn is theirs until they answer, nothing else moves.
const ask: Command = {
  name: 'ask',
  summary:
    'Ask the person a question while you do a step: the turn is theirs until they answer (the step, round and lease stay); wait wakes on the answer, and next and show give it',
  args: ['id', 'question'],
  options: {},
  execute: (input) => {
    const [id = '', question = ''] = input.args;
    const { actor, channel } = input;
    return withAgent(input, (project) => {
      const asked = askQuestion(project, { id, text: question, actor, channel });
      return { data: asked, text: asked.text };
    });
  },
};

const release: Command = {
  name: 'release',
  summary:
    'Drop the lease you hold on an item; moving it off the agent turn releases it too. --later sets it aside for you (next and wait skip it) until it moves or you claim it again',
  args: ['id'],
  options: { later: { flag: true } },
  execute: (input) => {
    const [id = ''] = input.args;
    const { actor } = input;
    const later = input.flag('later');
    return withAgent(input, (project) => {
      const item = releaseItem(project, { id, actor, later });
      const released = itemResult(project, item);
      if (!later) return released;
      const aside = `Set ${item.id} aside: otea next and otea wait --unclaimed leave it out for you until it moves or you claim it again (otea claim ${item.id}).`;
      return { ...released, text: `${released.text}\n${aside}` };
    });
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

// A diagram Otea cannot draw (outside its Mermaid flowchart subset, core/diagram.ts) is kept, and
// the person sees its source: the agent is told, with the subset, so it can attach one that draws.
function diagramNote(path: string, { filename }: { filename: string }): string {
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch {
    return '';
  }
  const parsed = parseDiagram(source);
  if (parsed.ok) return '';
  return `\nOtea cannot draw ${filename} (line ${parsed.line}: ${parsed.message}): the person sees its source. It draws a Mermaid flowchart: flowchart or graph LR|TD|RL|BT first, then nodes id[label], id(label) or id{label} joined by -->, ---, -.-> or ==> (with |label|); attach a version that keeps to it.`;
}

const attach: Command = {
  name: 'attach',
  summary: `Attach a file to an open item as evidence (at most ${MAX_EVIDENCE_MB} MB), into an evidence module of its type that accepts it; --module picks one when several do, --role before and after fill a compare; --point ticks that checklist point with it`,
  args: ['id', 'file'],
  options: {
    role: { choices: EVIDENCE_ROLES },
    module: { placeholder: 'id' },
    caption: { placeholder: 'text' },
    point: { placeholder: 'checklist point' },
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
      const same = evidence.duplicate
        ? `\n${evidence.itemId} already has this file as #${evidence.id}; nothing added.`
        : '';
      const data = name === undefined ? evidence : { ...evidence, moduleName: name };
      const point = option('point');
      const ticked =
        point === undefined
          ? undefined
          : tickPoint(project, { id, point, source: { evidence: evidence.id }, actor, channel });
      const drawn = evidence.kind === 'diagram' ? diagramNote(evidenceInput.path, evidence) : '';
      const text = `${formatEvidence(shown)}${same}${drawn}${ticked ? `\n${ticked.text}` : ''}`;
      return withNotes(project, evidence.itemId, {
        // --json and MCP read the diagram's refusal to be drawn too.
        data: {
          ...data,
          ...(ticked ? { ticked } : {}),
          ...(drawn ? { cannotDraw: drawn.trim() } : {}),
        },
        text,
      });
    });
  },
};

// A file attached by mistake, taken back before the item moves on (AGENTS3-4).
const detach: Command = {
  name: 'detach',
  summary:
    'Take back a file you attached by mistake (its number in show), before the item moves on',
  args: ['id', 'evidence'],
  options: {},
  execute: (input) => {
    const [id = '', number = ''] = input.args;
    const evidence = Number(number.replace(/^#/, ''));
    if (!Number.isInteger(evidence) || evidence < 1) {
      throw new UsageError(
        `Not a file number: ${number}. Pass the number show gives it, such as 3`,
      );
    }
    const { actor, channel } = input;
    return withAgent(input, (project) => {
      const entry = detachEvidence(project, { id, evidence, actor, channel });
      const text = `Detached #${entry.id} ${entry.filename} from ${entry.itemId}.`;
      return { data: { ...entry, detached: true }, text };
    });
  },
};

// Phone access, when a door is open: the chosen transport, the URLs a phone opens on it (on the
// local network the .local name first when it resolves; on Tailscale its HTTPS name), the first
// pairing code, and on the local network the same pairing link by IP when the first is a name.
type PhoneServed = {
  transport: TransportKind;
  urls: string[];
  pairingUrl: string | undefined;
  byAddress?: string;
  code: string | undefined;
};

// `url`: the page of the project the command ran in (or the server's home outside any project);
// `attached`: another otea serve was running already, and this one only pointed at it.
type Served = { url: string; signInUrl: string; attached?: true; phone?: PhoneServed };

type ServeOptions = {
  port: number;
  lan: boolean;
  tailscale: TailscaleCli;
  probe: Probe;
  warn: Input['warn'];
};

// The project the command runs in, when there is one; a local one is remembered for the server to
// serve (a registered one it finds in the registry). Its database is closed again: the server
// opens its own.
function projectHere(cwd: string): { id: string } | undefined {
  let project: Project;
  try {
    project = openProject(cwd);
  } catch (error) {
    if (error instanceof OteaError && error.details?.kind === 'no_project') return undefined;
    throw error;
  }
  try {
    const { id } = project.identity;
    if (project.storage === 'local') {
      withMachine(process.env, (machine) =>
        rememberLocalProject(machine, { id, root: project.root }),
      );
    }
    return { id };
  } finally {
    project.db.close();
  }
}

// The page to open, and the sign-in link that lands on it.
function pages(url: string, token: string, here: { id: string } | undefined) {
  const next = here === undefined ? '/' : `/p/${here.id}/`;
  return {
    url: `${url}${next}`,
    signInUrl: `${url}/auth?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`,
  };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// This computer's otea serve, when one runs and answers with this Otea home's key.
async function runningServer(home: string): Promise<{ url: string; token: string } | undefined> {
  const info = readServeFile(home);
  const token = readUiToken(home);
  if (!info || !token || !alive(info.pid)) return undefined;
  const url = `http://127.0.0.1:${info.port}`;
  const probe = await probeSignIn(`${url}/auth?token=${encodeURIComponent(token)}`);
  return probe === 'ours' ? { url, token } : undefined;
}

// How often the server looks for projects registered (or served) since it started, so each one's
// notices go out without waiting for a page to open it.
const SYNC_EVERY_MS = 10_000;

async function serveUntil(
  signal: AbortSignal,
  cwd: string,
  options: ServeOptions,
): Promise<Served> {
  const { port, lan, tailscale, probe, warn } = options;
  const here = projectHere(cwd);
  const home = oteaHome();
  // One server per Otea home: a second otea serve points at the one running.
  const running = await runningServer(home);
  if (running) return { ...pages(running.url, running.token, here), attached: true };
  const token = ensureUiToken(home, { warn });
  const machine = openMachine();
  const source = machineProjects(process.env, machine);
  // The web server's modules load only here, so every other command starts without them.
  const [{ createServer }, { listen, localNetwork }, { pairingUrl }] = await Promise.all([
    import('../server/server.ts'),
    import('../server/listen.ts'),
    import('../server/pairing.ts'),
  ]);
  try {
    const server = createServer(source, {
      token,
      machine,
      computer: hostname(),
      tailscale,
      probe,
      // The server's own key pair for Web Push, kept beside the UI token.
      notify: { keys: ensureVapidKeys(home, { warn }) },
      network: localNetwork,
    });
    const listening = await listen(server, port);
    // Open to the local network when it was left open (Settings › Phone, otea phone lan --open),
    // or for this run only with --lan; if it cannot open, Otea still serves this computer.
    if (lan || lanOpen(machine)) {
      await server.lan.open().catch((error: unknown) => {
        warn(`Could not open Otea to the local network: ${(error as Error).message}`);
      });
    }
    writeServeFile(home, { port: listening.port, pid: process.pid });
    const sync = setInterval(() => server.sync(), SYNC_EVERY_MS);
    sync.unref();
    const stop = () => {
      clearInterval(sync);
      removeServeFile(home, process.pid);
      return listening.close().finally(() => machine.close());
    };
    signal.addEventListener('abort', stop, { once: true });
    const served = pages(listening.url, token, here);
    const door = server.phone.chosen();
    if (!door) return served;
    const urls = door.urls(listening.port);
    const code = server.phone.codes.issue();
    const first = urls[0];
    // The .local name comes first when it resolves; the same link by IP comes along.
    const byIp = urls.find((url) => !new URL(url).hostname.endsWith('.local'));
    const byAddress =
      door.kind === 'lan' && first !== byIp && byIp !== undefined
        ? { byAddress: pairingUrl(byIp, code) }
        : {};
    return {
      ...served,
      phone: {
        transport: door.kind,
        urls,
        pairingUrl: first === undefined ? undefined : pairingUrl(first, code),
        ...byAddress,
        code: first === undefined ? undefined : formatCode(code.code),
      },
    };
  } catch (error) {
    source.close();
    machine.close();
    throw error;
  }
}

function phoneText(phone: PhoneServed): string {
  if (phone.pairingUrl === undefined) {
    return 'LAN access is on, but this computer has no private network address a phone could reach';
  }
  const where =
    phone.transport === 'tailscale'
      ? `Phone access through Tailscale: ${phone.urls.join(', ')} (your tailnet's devices only; if a phone cannot open it, run otea phone tailscale)`
      : `LAN access on: ${phone.urls.join(', ')} (same network only; otea phone tailscale reaches it when away)`;
  return [
    where,
    `Pair a phone: scan this code, or open ${phone.pairingUrl} (pairing code ${phone.code}, 10 minutes, works once; the phone then opens every project on this computer)`,
    ...(phone.byAddress
      ? [`If the phone cannot open the .local name, open ${phone.byAddress}`]
      : []),
    renderUnicodeCompact(phone.pairingUrl, { ecc: 'M', border: 2 }),
    'A new code and the paired devices are in the UI, in Settings > Phone; otea devices list and revoke them too',
  ].join('\n');
}

const serve: Command = {
  name: 'serve',
  summary: `Serve the live UI of every project on this computer on 127.0.0.1 (default port ${DEFAULT_PORT}) until Ctrl+C, and open this project's page signed in; when this computer's otea serve runs already, it opens this project there instead. It also opens to phones on the same network when that was left open (Settings > Phone, otea phone lan --open), and --lan opens it for this run only; a phone on Tailscale (otea phone tailscale) pairs without it`,
  args: [],
  options: { port: {}, 'no-open': { flag: true }, lan: { flag: true } },
  execute: async ({ cwd, option, flag, signal, openUrl, warn, tailscale, probe }) => {
    // A server whose starter is gone (an agent's session that ran it in the background ended)
    // stops, as it would with the terminal that ran it.
    const owner = watchOwner(signal);
    const served = await serveUntil(owner.signal, cwd, {
      port: portFrom(option('port')),
      lan: flag('lan'),
      tailscale,
      probe,
      warn,
    }).catch((error: unknown) => {
      owner.stop();
      throw error;
    });
    // Pointing at the server that runs: nothing of this process stays running.
    if (served.attached) owner.stop();
    const { url, signInUrl, phone, attached } = served;
    // With --no-open the person signs a browser in by hand, from a terminal or from what an agent
    // that started the server relays. The link carries the server's key: it is never in --json.
    const signIn = !flag('no-open')
      ? []
      : [
          `Sign a browser in at ${signInUrl} (it holds this computer's Otea key: keep it to yourself)`,
        ];
    if (!flag('no-open')) {
      await openUrl(signInUrl).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        warn(`Could not open a browser (${reason}); run "otea open" to try again`);
      });
    }
    const where = attached
      ? `Otea already runs on this computer: this project is at ${url}`
      : `Otea running at ${url}`;
    const running = [where, ...signIn].join('\n');
    const data = { url, ...(attached ? { attached } : {}) };
    if (!phone) return { data, text: running };
    return { data: { ...data, phone }, text: `${running}\n${phoneText(phone)}` };
  },
};

const devicesList: Command = {
  name: 'devices list',
  summary:
    'List the paired phones and tablets (local network or otea phone tailscale), with when each was last seen; each one opens every project on this computer',
  args: [],
  options: {},
  execute: () => {
    const devices = withMachine(process.env, listDevices);
    const text = devices
      .map(
        ({ id, name, pairedAt, lastSeenAt, hint }) =>
          `${id}  ${name}  paired ${timeText(pairedAt)}  last seen ${lastSeenAt ? timeText(lastSeenAt) : 'never'}  token ··${hint}`,
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
  execute: ({ args: [id = ''] }) => {
    const device = withMachine(process.env, (machine) => revokeDevice(machine, id));
    return { data: device, text: `Revoked ${device.id} (${device.name})` };
  },
};

function notRunning(message: string): CommandFailure {
  return new CommandFailure('not_running', `${message}; run "otea serve" first`);
}

const open: Command = {
  name: 'open',
  summary:
    "Open this project's page on this computer's running otea serve in the browser, signed in to act on items",
  args: [],
  options: { port: {} },
  execute: async ({ cwd, option, openUrl }) => {
    const here = projectHere(cwd);
    const home = oteaHome();
    const port = portToOpen(option('port'));
    const token = readUiToken(home);
    if (!token) throw notRunning('No Otea server has been started on this computer');
    const { url, signInUrl: link } = pages(`http://127.0.0.1:${port}`, token, here);
    const probe = await probeSignIn(link);
    if (probe === 'down') throw notRunning(`No Otea server answers on port ${port}`);
    if (probe === 'other')
      throw notRunning(`The Otea server on port ${port} is another Otea home's (OTEA_HOME)`);
    await openUrl(link).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not open a browser (${reason})`);
    });
    return { data: { url }, text: `Opened Otea at ${url}` };
  },
};

// Stdout carries the protocol, so the command prints nothing itself.
// The agent counts as heard as soon as its MCP client connects, and again on every beat while the
// server stays open. Without a project yet there is nowhere to note it, and every tool call will
// say so, so that is no warning.
// Each server is its own session (process.pid): a name another open session works under is not
// taken (claimName), and the refusal reaches the agent on its call.
function heardBy(
  cwd: string,
  agent: string,
  harness: Harness | undefined,
  warn: Input['warn'],
  newSession = false,
  // Its first call under the name: a new server its harness started may take it from the old one.
  fresh = newSession,
  // When it was heard, for the server to end its listening when its client closes.
  heard?: (at: string) => void,
) {
  try {
    withProject(cwd, (project) => {
      claimName(project.db, agent, process.pid, undefined, undefined, process.ppid, fresh);
      const at = hearAgent(project.db, {
        agent,
        channel: 'mcp',
        harness,
        session: process.pid,
        launcher: process.ppid,
        ...(newSession ? { newSession } : {}),
      });
      heard?.(at);
    });
    return true;
  } catch (error) {
    if (error instanceof OteaError && error.code === 'not_found') return true;
    if (error instanceof OteaError && error.code === 'name_in_use') return false;
    warn(`could not note ${agent} as seen: ${(error as Error).message}`);
    return true;
  }
}

// The first call of an agent on this server: refused while another open session works under its
// name, so two sessions never share one.
function claimedBy(cwd: string, agent: string, fresh: boolean): void {
  try {
    withProject(cwd, (project) =>
      claimName(project.db, agent, process.pid, undefined, undefined, process.ppid, fresh),
    );
  } catch (error) {
    if (error instanceof OteaError && error.code === 'name_in_use') throw error;
  }
}

const mcp: Command = {
  name: 'mcp',
  summary:
    'Serve the agent commands as MCP tools on stdin and stdout until the client disconnects; each tool call acts as the agent its as argument names (or the one --as names). --project <id> pins the server to that project: it refuses writes from a folder of another one, and serves it when started outside any project',
  args: [],
  options: { project: { placeholder: 'id' } },
  execute: async ({ cwd, agent, pin: pinned, option, signal, warn }) => {
    if (agent !== undefined) assertAgentName(agent);
    const pin = option('project') ?? pinned;
    // A harness that starts the server outside any project (its own config, kept for every folder)
    // gets the project the server is pinned to.
    if (pin !== undefined && !process.env.OTEA_PROJECT && !projectAt(cwd)) {
      process.env.OTEA_PROJECT = pin;
    }
    // Every agent that connected or called through this server, heard again on each beat until
    // the client disconnects: that is what makes it count as connected.
    const voices = new Set<string>();
    // When this server last heard each of them: closing, it ends their listening (endListening).
    const lastHeard = new Map<string, string>();
    const note = (name: string) => (at: string) => lastHeard.set(name, at);
    // Every name this server ever worked under: one it lost to a newer server never counts as new.
    const used = new Set<string>();
    let client: Harness | undefined;
    // The client names its harness as it connects. Its agent is heard from its first call: a
    // harness that only loads the server (a background service, a session that never calls Otea)
    // is no agent at work, and shows as none.
    const greeted = (harness: Harness | undefined) => {
      client = harness;
    };
    const heard = (name: string) => {
      const fresh = !used.has(name);
      used.add(name);
      claimedBy(cwd, name, fresh);
      heardBy(cwd, name, client, warn, false, fresh, note(name));
      voices.add(name);
    };
    const beat = setInterval(() => {
      for (const name of voices)
        if (!heardBy(cwd, name, client, warn, false, false, note(name))) voices.delete(name);
    }, LISTEN_BEAT_MS);
    beat.unref();
    const named = agent === undefined ? {} : { agent };
    try {
      // Whether the project keeps side topics, read once: the guide the agent gets says so.
      const topics = (() => {
        try {
          return withProject(cwd, (project) => topicsOn(project));
        } catch {
          return false;
        }
      })();
      // The MCP server's modules load only here, so every other command starts without them.
      const { createMcpServer, serveStdio } = await import('../mcp/server.ts');
      await serveStdio(
        createMcpServer(COMMANDS, {
          cwd,
          ...named,
          ...(pin === undefined ? {} : { pin }),
          topics,
          warn,
          greeted,
          heard,
          still: (name) => claimedBy(cwd, name, false),
        }),
        signal,
      );
    } finally {
      clearInterval(beat);
      // The client closed the session: its agents no longer listen through this server.
      endListeningAll(cwd, lastHeard);
    }
    return undefined;
  },
};

// Whether a project resolves from the folder (or OTEA_PROJECT names one).
function projectAt(cwd: string): boolean {
  try {
    withProject(cwd, () => undefined);
    return true;
  } catch (error) {
    if (error instanceof OteaError && error.code === 'not_found') return false;
    throw error;
  }
}

function endListeningAll(cwd: string, lastHeard: ReadonlyMap<string, string>): void {
  if (lastHeard.size === 0) return;
  try {
    withProject(cwd, (project) => {
      for (const [name, at] of lastHeard) endListening(project.db, name, at, process.pid);
    });
  } catch {
    // The project may be gone; its agents' listening then lapses on its own.
  }
}

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

function gateText({ gate, allowed, items, refusal }: GateCheck): string {
  // On a board, the step engine's words for each item, and why a push into a protected base
  // branch that brings in none of its items is refused.
  const said = items.filter((item) => allowed || !item.allowed).flatMap(({ text }) => text ?? []);
  if (refusal !== undefined) said.push(refusal);
  if (said.length > 0) return said.join('\n');
  if (allowed) {
    const states = items.map(({ id, stateName }) => `${id} is ${stateName}`);
    return `${gate} allowed: ${states.join(', ')}`;
  }
  return items
    .filter((item) => !item.allowed)
    .map(
      ({ id, stateName, allowedInNames }) =>
        `${gate} refused: ${id} is ${stateName}; ${gate} is allowed only in ${allowedInNames.join(', ')}`,
    )
    .join('\n');
}

// The commits a push sends, as `--commits <remote>..<local>` names them: what the remote has of
// the branch and what it gets (the ids a pre-push hook reads; all zeros for a branch created or
// deleted).
function commitsOption(value: string): { from: string; to: string } {
  const [from, to, ...rest] = value.split('..');
  if (from === undefined || to === undefined || rest.length > 0) {
    throw new UsageError('--commits takes <remote>..<local>, the commits the push sends');
  }
  return { from, to };
}

// A gate check fails open: anything that keeps it from answering allows the action, with a note.
// A push or merge in a repo the project cannot match (--repo with no name) is refused, not
// allowed, whatever its folder: on a project, failing open there would skip every gate.
const check: Command = {
  name: 'check',
  summary:
    'Check whether the items matching the fields allow a gated action: exit 0 when allowed, 19 when refused, 2 for a gate nothing declares; repo names match whatever their case; it allows the action, with a note, when no item matches or the check cannot run. --branch defaults to the branch checked out, --repo to the name the project gives the repo checked out (otea repos list), refused when the project does not know it. A push or merge into a base branch a board protects is checked against the items whose branches it brings in: --commits <remote>..<local> names the commits a push sends (the pre-push hook passes them), else the branch against the remote branch of the same name (origin/<branch>), or its upstream when the remote has none',
  args: [],
  options: {
    gate: { required: true, placeholder: 'action' },
    field: { multiple: true, placeholder: 'key=value' },
    branch: { optionalValue: true, placeholder: 'name' },
    repo: { optionalValue: true, placeholder: 'name' },
    commits: { placeholder: 'remote..local' },
  },
  execute: async (input) => {
    const gate = input.required('gate');
    let result: GateCheck;
    try {
      const { cwd } = input;
      const named = input.option('branch');
      const commits = input.option('commits');
      const sent = commits === undefined ? undefined : commitsOption(commits);
      result = withProject(cwd, (project) => {
        // The branch is asked of git only when the check needs it.
        const branch = () => named || currentBranch(cwd);
        const brings: Brings =
          sent === undefined
            ? () => branchesBrought(cwd, branch(), remoteOf(cwd, branch()))
            : () => branchesBrought(cwd, sent.to, sent.from);
        return checkGate(project, gate, gateFields(input, cwd, project, branch), brings);
      });
    } catch (error) {
      if (error instanceof UsageError) throw error;
      // Inside a project, a repo it cannot match could be any of its repos: refused, not allowed.
      if (error instanceof UnknownRepo) {
        input.warn(`${gate} refused: ${error.message}`);
        return { data: { gate, allowed: false, items: [] }, text: '', failure: 'gate_refused' };
      }
      // A field or a gate nothing names is a typo in the call, never a reason to allow the action.
      if (error instanceof OteaError && error.code === 'invalid_fields')
        throw new UsageError(error.message);
      if (error instanceof OteaError && error.code === 'invalid_gate') throw error;
      const message = error instanceof Error ? error.message : String(error);
      result = { gate, allowed: true, items: [], note: `could not check (${message})` };
    }
    if (result.note) input.warn(`${result.note}; ${gate} allowed`);
    if (result.items.length === 0 && result.refusal === undefined)
      return { data: result, text: '' };
    const text = gateText(result);
    if (result.allowed) return { data: result, text };
    return { data: result, text, failure: 'gate_refused' };
  },
};

// The hooks a command names, of those it takes; never none. No gate depends on a harness hook:
// install writes only the git hook, and remove --claude takes out the Claude Code hooks an older
// otea hook install --claude wrote, whose commands are gone.
function hookTargets<T extends string>({ flag }: Input, targets: readonly T[]): T[] {
  const named = targets.filter((target) => flag(target));
  if (named.length === 0) {
    throw new UsageError(`Name the hook: ${targets.map((target) => `--${target}`).join(' or ')}`);
  }
  return named;
}

function hookText({ path, action, content, note, said }: HookChange): string {
  const why = note === undefined ? '' : ` (${note})`;
  if (said === undefined && action === 'unchanged')
    return `${path} already has the Otea hook${why}`;
  if (said === undefined && action === 'absent') return `${path} has no Otea hook`;
  const done = { created: 'Wrote', updated: 'Rewrote', removed: 'Removed the Otea hook from' };
  const head = said ?? `${done[action as keyof typeof done]} ${path}${why}`;
  return content === undefined ? head : `${head}:\n${indent(content.trimEnd())}`;
}

function hookOutput(changes: HookChange[]): Output {
  return { data: changes, text: changes.map(hookText).join('\n') };
}

const hookInstall: Command = {
  name: 'hook install',
  summary:
    'Make the gates hard in the repo here, whatever tool runs the push or merge: --git writes a pre-push hook that runs otea check --gate push (never overwrites a hook of someone else); --forge has gh set a GitHub ruleset on the base branches the boards protect, so GitHub refuses a direct push, a force push and a deletion of them, or prints the steps to set it by hand',
  args: [],
  options: { git: { flag: true }, forge: { flag: true } },
  // Each hook is installed on its own: one that cannot be (no repo, a team's own pre-push hook)
  // never keeps another from being written, and the refusal says what was written.
  execute: (input) => {
    const changes: HookChange[] = [];
    const refused: Error[] = [];
    for (const target of hookTargets(input, ['git', 'forge'])) {
      try {
        changes.push(
          target === 'git'
            ? installGitHook(input.cwd, withHome(OTEA, input.home))
            : installForge(input.cwd, withProject(input.cwd, protectedBases), input.forge),
        );
      } catch (error) {
        if (!(error instanceof CommandFailure || error instanceof OteaError)) throw error;
        refused.push(error);
      }
    }
    const [first] = refused;
    if (!first) return hookOutput(changes);
    const said = [...changes.map(hookText), ...refused.map(({ message }) => message)];
    throw new CommandFailure(failureCode(first), said.join('\n'));
  },
};

const hookRemove: Command = {
  name: 'hook remove',
  summary:
    'Remove the hooks Otea wrote, leaving every other hook and rule: --git the pre-push hook; --forge the GitHub ruleset hook install --forge set; --claude the Claude Code hooks and allow rules an older otea hook install --claude added to .claude/settings.local.json',
  args: [],
  options: { git: { flag: true }, forge: { flag: true }, claude: { flag: true } },
  execute: (input) =>
    hookOutput(
      hookTargets(input, ['git', 'forge', 'claude']).map((target) =>
        target === 'git'
          ? removeGitHook(input.cwd)
          : target === 'forge'
            ? removeForge(input.cwd, input.forge)
            : removeClaudeHook(input.cwd),
      ),
    ),
};

// Side topics (app/topics.ts): what the person asked an agent off the work, kept as a short
// conversation so none is left hanging. The agent records the question and answers it; the person
// keeps it going, closes it or turns it into a task. They are not work: no lease, never in next.
const topicOn: Command = {
  name: 'topic on',
  summary:
    'For the person: keep side topics for this project, so agents record the questions you ask them off the work, with their answers',
  args: [],
  options: {},
  execute: (input) =>
    withProject(input.cwd, (project) => {
      setTopicsOn(project, true);
      return {
        data: { topics: true },
        text: 'Topics are on: agents record the side questions you ask them.',
      };
    }),
};

const topicOff: Command = {
  name: 'topic off',
  summary: 'For the person: stop keeping side topics for this project; the ones kept stay',
  args: [],
  options: {},
  execute: (input) =>
    withProject(input.cwd, (project) => {
      setTopicsOn(project, false);
      return { data: { topics: false }, text: 'Topics are off.' };
    }),
};

const topicAdd: Command = {
  name: 'topic add',
  summary:
    'Record a question the person asked you off the work at hand, not a request to do work, before you answer it (--title, short; --session and --resume when known); then answer it with topic answer',
  args: ['question'],
  options: { title: {}, session: {}, resume: {} },
  execute: (input) => {
    const [question = ''] = input.args;
    const title = input.option('title');
    const session = input.option('session');
    const resume = input.option('resume');
    const { actor } = input;
    return withAgent(input, (project) => {
      requireTopicsOn(project);
      const topic = addTopic(project, {
        question,
        actor,
        ...(title === undefined ? {} : { title }),
        ...(session === undefined ? {} : { session }),
        ...(resume === undefined ? {} : { resume }),
      });
      return {
        data: topic,
        text: `Recorded ${topic.id}. Answer it with otea topic answer ${topic.id} --summary "<short answer>" --full "<your full answer>".`,
      };
    });
  },
};

const topicAnswer: Command = {
  name: 'topic answer',
  summary:
    'Answer a topic: --summary, a line or two; --full, your whole answer as given in the chat',
  args: ['id'],
  options: { summary: {}, full: {}, session: {}, resume: {} },
  execute: (input) => {
    const [id = ''] = input.args;
    const summary = input.option('summary');
    const full = input.option('full');
    const session = input.option('session');
    const resume = input.option('resume');
    const { actor } = input;
    return withAgent(input, (project) => {
      requireTopicsOn(project);
      const topic = answerTopic(project, {
        id,
        actor,
        ...(summary === undefined ? {} : { summary }),
        ...(full === undefined ? {} : { full }),
        ...(session === undefined ? {} : { session }),
        ...(resume === undefined ? {} : { resume }),
      });
      return { data: topic, text: `Answered ${topic.id}; it is the person's turn.` };
    });
  },
};

const topicList: Command = {
  name: 'topic list',
  summary:
    'List the side topics that wait on someone, what is left hanging first (--all, closed ones too); --search finds every topic that mentions all the words, with its answer',
  args: [],
  options: { all: { flag: true }, search: { placeholder: 'words' } },
  execute: (input) =>
    withReader(input, (project) => {
      const search = input.option('search');
      const topics = listTopics(project, {
        all: input.flag('all'),
        ...(search === undefined ? {} : { search }),
      });
      return { data: topics, text: topicsListText(topics, search) };
    }),
};

const topicShow: Command = {
  name: 'topic show',
  summary: 'Show a side topic: its question, answers and notes, with each full answer',
  args: ['id'],
  options: {},
  execute: (input) => {
    const [id = ''] = input.args;
    return withReader(input, (project) => {
      const topic = requireTopic(project, id);
      return { data: topic, text: topicText(topic) };
    });
  },
};

const topicNote: Command = {
  name: 'topic note',
  summary: 'For the person: keep a topic going with a note; the agent that answered it gets it',
  args: ['id', 'text'],
  options: {},
  execute: (input) => {
    const [id = '', text = ''] = input.args;
    return withReader(input, (project) => {
      const topic = noteTopic(project, { id, text, actor: input.reader });
      return { data: topic, text: `Left a note on ${topic.id}; it is the agent's turn.` };
    });
  },
};

const topicClose: Command = {
  name: 'topic close',
  summary: 'For the person: close a topic you have read',
  args: ['id'],
  options: {},
  execute: (input) => {
    const [id = ''] = input.args;
    return withReader(input, (project) => {
      const topic = closeTopic(project, { id, actor: input.reader });
      return { data: topic, text: `Closed ${topic.id}.` };
    });
  },
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
  promptCommand,
  brief,
  events,
  stats,
  wait,
  claim,
  profileCommandSpec,
  whoami,
  heartbeat,
  release,
  update,
  attach,
  detach,
  link,
  unlink,
  next,
  reply,
  crop,
  merged,
  reopen,
  tick,
  topicOn,
  topicOff,
  topicAdd,
  topicAnswer,
  topicList,
  topicShow,
  topicNote,
  topicClose,
  ask,
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
  ...PHONE_COMMANDS,
  mcp,
];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
