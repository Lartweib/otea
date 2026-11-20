import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { listCollectionViews, typeOfItem } from '../app/collections.ts';
import { evidenceDir } from '../app/evidence.ts';
import { repoOfItem } from '../app/gates.ts';
import {
  forgetProjectPath,
  keyOf,
  kindOf,
  listProjects,
  openRegistry,
  relinkProjectPath,
  withRegistry,
} from '../app/home.ts';
import { type Item, listItems } from '../app/items.ts';
import type { Launcher } from '../app/launcher.ts';
import { liveBoards } from '../app/next.ts';
import { addPathToProject, databasePath, type Env, type Project } from '../app/project.ts';
import { identityAt, listRepos, type Repo, readReposAtFolder, reposInside } from '../app/repos.ts';
import { listTopics } from '../app/topics.ts';
import { CommandFailure } from '../cli/command.ts';
import { hasOteaGitHook, hasOutdatedGitHook, installGitHook } from '../cli/hooks.ts';
import { OteaError } from '../core/errors.ts';
import { stateLabel } from '../core/workflow.ts';
import type { Storage } from '../store/registry.ts';
import type { ServedPath, ServedProject } from './hub.ts';

export type OverviewPath = ServedPath;

// A project on this machine as the projects inbox and the switcher read it: what waits for you
// there and how much is with agents. Every one is served here, at /p/<id>/.
export type ProjectOverview = {
  id: string;
  name: string;
  storage: Storage;
  // The project the page asking is on.
  current: boolean;
  paths: OverviewPath[];
  // Open items on your turn, each with its type's icon.
  waiting: WaitingItem[];
  // Side topics an agent answered: the person's turn to read, though never work.
  topics: AnsweredTopic[];
  // Open items on an agent's turn.
  withAgents: number;
  open: number;
  // Why its items could not be read (its data is missing, say).
  unavailable?: string;
};

// `stateName`: the step it is on in words (a board's steps are hidden ids), as its type names it.
export type WaitingItem = Item & { icon?: string; stateName: string };

function withIcon(project: Project, item: Item): WaitingItem {
  const type = typeOfItem(project, item);
  const stateName = stateLabel(type.workflow, item.state);
  return type.icon === undefined ? { ...item, stateName } : { ...item, icon: type.icon, stateName };
}

// An answered topic as the inbox lists it: its title and the agent's last summary.
export type AnsweredTopic = {
  id: string;
  title: string;
  summary: string;
  agent?: string;
  updatedAt: string;
};

function answeredTopics(project: Project): AnsweredTopic[] {
  return listTopics(project)
    .filter((topic) => topic.state === 'answered')
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    .map((topic) => ({
      id: topic.id,
      title: topic.title,
      summary: topic.turns.findLast((turn) => turn.kind === 'answer')?.text ?? '',
      ...(topic.agent === undefined ? {} : { agent: topic.agent }),
      updatedAt: topic.updatedAt,
    }));
}

type Counts = Pick<ProjectOverview, 'waiting' | 'topics' | 'withAgents' | 'open'>;

// What waits for you is what Te toca lists: your turn, and the work of an agent that went quiet
// (its lease ran out), yours to restart or reassign (ONB3-5).
const yours = (item: Item) =>
  item.turn === 'human' || (item.turn === 'agent' && !!item.expiredLease);

export function countsOf(project: Project): Counts {
  const open = listItems(project).filter((item) => item.turn !== 'none');
  return {
    waiting: open.filter(yours).map((item) => withIcon(project, item)),
    topics: answeredTopics(project),
    withAgents: open.filter((item) => !yours(item)).length,
    open: open.length,
  };
}

const NOTHING: Counts = { waiting: [], topics: [], withAgents: 0, open: 0 };

function overviewOf(served: ServedProject, currentId: string): ProjectOverview {
  const { id, name, storage, paths, project } = served;
  const base = { id, name, storage, paths, current: id === currentId };
  if (!project) {
    return { ...base, ...NOTHING, unavailable: served.unavailable ?? `${name} is not available` };
  }
  try {
    return { ...base, ...countsOf(project) };
  } catch (error) {
    const unavailable = error instanceof Error ? error.message : String(error);
    return { ...base, ...NOTHING, unavailable };
  }
}

// Every project this server serves, by name; `currentId` is the one the page asking is on.
export function projectOverviews(
  served: readonly ServedProject[],
  currentId: string,
): ProjectOverview[] {
  return served.map((each) => overviewOf(each, currentId));
}

export type GateKind = 'hard' | 'soft';

// A repo of the project: a linked repo, or one inside a linked folder. Its name is what a repo
// task's `repo` field holds: the name the project gives it (app/repos.ts), or its folder's name
// while the project does not know it. `remote`: it has an origin, so its pushes leave the machine.
// `hookOutdated`: an older Otea wrote its pre-push hook, which lets a push through when Otea cannot
// check it; otea hook install --git updates it.
export type RepoSettings = {
  name: string;
  folder: string;
  gate: GateKind;
  items: number;
  remote: boolean;
  hookOutdated?: true;
};

export type PathSettings = OverviewPath & { repos: RepoSettings[] };

export type ProjectSettings = {
  id: string;
  name: string;
  storage: Storage;
  root: string;
  dataDir: string;
  // A local project is not in the registry: its one folder cannot be relinked or forgotten.
  registered: boolean;
  database: { path: string; bytes: number };
  evidence: { path: string; bytes: number; files: number };
  items: number;
  collections: Array<{ name: string; preset: string }>;
  paths: PathSettings[];
};

function sizeOf(path: string): { bytes: number; files: number } {
  if (!existsSync(path)) return { bytes: 0, files: 0 };
  const stat = statSync(path);
  if (!stat.isDirectory()) return { bytes: stat.size, files: 1 };
  return readdirSync(path).reduce(
    (sum, entry) => {
      const inner = sizeOf(join(path, entry));
      return { bytes: sum.bytes + inner.bytes, files: sum.files + inner.files };
    },
    { bytes: 0, files: 0 },
  );
}

// `itemRepos`: the repository each item's branch is in (a board's guard reads it from a field);
// `known`: the repos the project knows, by what identifies them.
type RepoNames = { itemRepos: readonly unknown[]; known: readonly Repo[] };

function repoOf(path: string, parent: string, { itemRepos, known }: RepoNames): RepoSettings {
  const identity = identityAt(path);
  const name = known.find((repo) => repo.identity === identity)?.name ?? basename(path);
  return {
    name,
    folder: relative(parent, path).replaceAll('\\', '/') || '.',
    gate: hasOteaGitHook(path) ? 'hard' : 'soft',
    items: itemRepos.filter((repo) => repo === name).length,
    remote: identity?.startsWith('remote:') ?? false,
    ...(hasOutdatedGitHook(path) ? { hookOutdated: true as const } : {}),
  };
}

// The repos a path holds: itself when it is a linked repo, the ones inside a linked folder.
function reposAt(path: OverviewPath): string[] {
  if (path.missing) return [];
  return path.kind === 'repo' ? [path.path] : reposInside(path.path);
}

function pathSettings(path: OverviewPath, names: RepoNames): PathSettings {
  return { ...path, repos: reposAt(path).map((repo) => repoOf(repo, path.path, names)) };
}

// Parent folders first, then linked repos, and the missing ones last.
const byPlace = (a: OverviewPath, b: OverviewPath) =>
  Number(a.missing) - Number(b.missing) || Number(a.kind === 'repo') - Number(b.kind === 'repo');

// The paths the project links, as the registry has them; a local project's one folder.
function projectPaths(project: Project, env: Env): OverviewPath[] {
  const { identity, root } = project;
  const listed = withRegistry(env, listProjects)?.find((each) => each.id === identity.id);
  return listed?.paths ?? [{ path: root, kind: kindOf(root), missing: false }];
}

export function projectSettings(project: Project, env: Env = process.env): ProjectSettings {
  const { identity, storage, root, dataDir } = project;
  const listed = withRegistry(env, listProjects)?.find((each) => each.id === identity.id);
  const paths = projectPaths(project, env);
  const items = listItems(project);
  const boards = liveBoards(project);
  const itemRepos = items.map((item) => repoOfItem(project, item, boards));
  const names = { itemRepos, known: listRepos(project, env) };
  const database = databasePath(dataDir);
  const evidence = evidenceDir(dataDir);
  return {
    ...identity,
    storage,
    root,
    dataDir,
    registered: listed !== undefined,
    database: { path: database, bytes: sizeOf(database).bytes + sizeOf(`${database}-wal`).bytes },
    evidence: { path: evidence, ...sizeOf(evidence) },
    items: items.length,
    collections: listCollectionViews(project).map(({ name, preset }) => ({ name, preset })),
    paths: [...paths].sort(byPlace).map((path) => pathSettings(path, names)),
  };
}

function inRegistry<T>(env: Env, use: (registry: DatabaseSync) => T): T {
  const registry = openRegistry(env);
  try {
    return use(registry);
  } finally {
    registry.close();
  }
}

// A path this project links, or an error: the settings of one project never touch another's.
function ownPath(registry: DatabaseSync, project: Project, path: string): void {
  const key = keyOf(path).pathKey;
  const own = listProjects(registry)
    .find((each) => each.id === project.identity.id)
    ?.paths.some((linked) => keyOf(linked.path).pathKey === key);
  if (!own) throw new OteaError('not_found', `${path} is not a path of ${project.identity.name}`);
}

// Links another folder to this project; a local project has no registry entry to link it to.
export function addPath(project: Project, path: string, env: Env = process.env): OverviewPath {
  if (project.storage === 'local') {
    throw new OteaError('forbidden', 'A local project has one folder; run otea migrate first');
  }
  const linked = addPathToProject(path, project.identity.id, env);
  readReposAtFolder(project, linked.path, env);
  return { path: linked.path, kind: linked.kind, missing: false };
}

export function relinkPath(
  project: Project,
  from: string,
  to: string,
  force: boolean,
  env: Env = process.env,
) {
  return inRegistry(env, (registry) => {
    ownPath(registry, project, from);
    const { link, match } = relinkProjectPath(registry, from, to, force);
    return { path: link.path, kind: link.kind, missing: false, match };
  });
}

export function forgetPath(project: Project, path: string, env: Env = process.env) {
  return inRegistry(env, (registry) => {
    ownPath(registry, project, path);
    const { link, remaining } = forgetProjectPath(registry, path);
    return { path: link.path, remaining };
  });
}

// What writing Otea's pre-push hook into the project's repos did: the repos it wrote it into, and
// the ones it left alone with why (a pre-push hook of their own, which Otea never overwrites).
export type GitHookInstall = {
  installed: Array<{ repo: string; path: string }>;
  refused: Array<{ repo: string; message: string }>;
};

// Writes Otea's pre-push hook into every repo of the project that has none, so a push the boards
// refuse is refused by git too (P2S-R3-1); a repo that has it already is left as it is. `otea` is
// how the hook runs this Otea again, as otea hook install --git writes it.
export function installGitHooks(
  project: Project,
  otea: Launcher,
  env: Env = process.env,
): GitHookInstall {
  const repos = [...new Set(projectPaths(project, env).flatMap(reposAt))];
  const known = listRepos(project, env);
  const nameOf = (path: string) => {
    const identity = identityAt(path);
    return known.find((repo) => repo.identity === identity)?.name ?? basename(path);
  };
  const result: GitHookInstall = { installed: [], refused: [] };
  for (const repo of repos.filter((path) => !hasOteaGitHook(path))) {
    try {
      const change = installGitHook(repo, otea);
      result.installed.push({ repo: nameOf(repo), path: change.path });
    } catch (error) {
      if (!(error instanceof CommandFailure)) throw error;
      result.refused.push({ repo: nameOf(repo), message: error.message });
    }
  }
  return result;
}
