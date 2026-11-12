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
  type ListedProject,
  listProjects,
  openRegistry,
  relinkProjectPath,
  withRegistry,
} from '../app/home.ts';
import { type Item, listItems } from '../app/items.ts';
import { liveBoards } from '../app/next.ts';
import {
  addPathToProject,
  databasePath,
  type Env,
  openRegistered,
  type Project,
} from '../app/project.ts';
import { hasOteaGitHook } from '../cli/hooks.ts';
import { readServeFile } from '../cli/serve-file.ts';
import { OteaError } from '../core/errors.ts';
import type { PathKind, Storage } from '../store/registry.ts';

export type OverviewPath = { path: string; kind: PathKind; missing: boolean };

// A project on this machine as the projects inbox and the switcher read it: what waits for you
// there, how much is with agents, and where another `otea serve` shows it.
export type ProjectOverview = {
  id: string;
  name: string;
  storage: Storage;
  // The project this server serves.
  current: boolean;
  paths: OverviewPath[];
  // Open items on your turn, each with its type's icon.
  waiting: WaitingItem[];
  // Open items on an agent's turn.
  withAgents: number;
  open: number;
  // The address of the `otea serve` running for it, when that is not this server.
  served?: string;
  // Why its items could not be read (its data is missing, say).
  unavailable?: string;
};

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function servedAt(dataDir: string): string | undefined {
  const info = readServeFile(dataDir);
  return info && alive(info.pid) ? `http://127.0.0.1:${info.port}` : undefined;
}

export type WaitingItem = Item & { icon?: string };

function withIcon(project: Project, item: Item): WaitingItem {
  const icon = typeOfItem(project, item).icon;
  return icon === undefined ? item : { ...item, icon };
}

type Counts = Pick<ProjectOverview, 'waiting' | 'withAgents' | 'open'>;

function countsOf(project: Project): Counts {
  const open = listItems(project).filter((item) => item.turn !== 'none');
  return {
    waiting: open.filter((item) => item.turn === 'human').map((item) => withIcon(project, item)),
    withAgents: open.filter((item) => item.turn === 'agent').length,
    open: open.length,
  };
}

const NOTHING: Counts = { waiting: [], withAgents: 0, open: 0 };

function overviewOf(listed: ListedProject, current: Project): ProjectOverview {
  const { id, name, storage, paths } = listed;
  const base = { id, name, storage, paths };
  if (id === current.identity.id) return { ...base, current: true, ...countsOf(current) };
  const served = servedAt(listed.dataDir);
  const root = paths.find((path) => !path.missing)?.path ?? paths[0]?.path ?? listed.dataDir;
  let other: Project | undefined;
  try {
    other = openRegistered(listed, root);
    return { ...base, current: false, ...countsOf(other), ...(served ? { served } : {}) };
  } catch (error) {
    const unavailable = error instanceof Error ? error.message : String(error);
    return { ...base, current: false, ...NOTHING, unavailable, ...(served ? { served } : {}) };
  } finally {
    other?.db.close();
  }
}

// Every registered project in the registry's order; a local project served here, which the
// registry does not hold, comes first.
export function projectOverviews(current: Project, env: Env = process.env): ProjectOverview[] {
  const listed = withRegistry(env, listProjects) ?? [];
  const overviews = listed.map((project) => overviewOf(project, current));
  if (overviews.some((overview) => overview.current)) return overviews;
  const { id, name } = current.identity;
  const here: ProjectOverview = {
    id,
    name,
    storage: current.storage,
    current: true,
    paths: [{ path: current.root, kind: kindOf(current.root), missing: false }],
    ...countsOf(current),
  };
  return [here, ...overviews];
}

export type GateKind = 'hard' | 'soft';

// A repo of the project: a linked repo, or one inside a linked folder. Its name is what a repo
// task's `repo` field holds: its folder's name.
export type RepoSettings = { name: string; folder: string; gate: GateKind; items: number };

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

const SKIPPED = new Set(['node_modules', '.git', '.otea']);

// The git repos at most two folders below a parent folder.
function reposInside(folder: string, depth = 2): string[] {
  if (depth === 0) return [];
  let entries: string[];
  try {
    entries = readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !SKIPPED.has(entry.name))
      .map((entry) => join(folder, entry.name));
  } catch {
    return [];
  }
  return entries.flatMap((dir) =>
    existsSync(join(dir, '.git')) ? [dir] : reposInside(dir, depth - 1),
  );
}

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

// `repos`: the repository each item's branch is in (a board's guard reads it from a field).
function repoOf(path: string, parent: string, repos: readonly unknown[]): RepoSettings {
  const name = basename(path);
  return {
    name,
    folder: relative(parent, path).replaceAll('\\', '/') || '.',
    gate: hasOteaGitHook(path) ? 'hard' : 'soft',
    items: repos.filter((repo) => repo === name).length,
  };
}

function pathSettings(path: OverviewPath, itemRepos: readonly unknown[]): PathSettings {
  if (path.missing) return { ...path, repos: [] };
  const repos =
    path.kind === 'repo'
      ? [repoOf(path.path, path.path, itemRepos)]
      : reposInside(path.path).map((repo) => repoOf(repo, path.path, itemRepos));
  return { ...path, repos };
}

// Parent folders first, then linked repos, and the missing ones last.
const byPlace = (a: OverviewPath, b: OverviewPath) =>
  Number(a.missing) - Number(b.missing) || Number(a.kind === 'repo') - Number(b.kind === 'repo');

export function projectSettings(project: Project, env: Env = process.env): ProjectSettings {
  const { identity, storage, root, dataDir } = project;
  const listed = withRegistry(env, listProjects)?.find((each) => each.id === identity.id);
  const paths: OverviewPath[] = listed?.paths ?? [
    { path: root, kind: kindOf(root), missing: false },
  ];
  const items = listItems(project);
  const boards = liveBoards(project);
  const repos = items.map((item) => repoOfItem(project, item, boards));
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
    paths: [...paths].sort(byPlace).map((path) => pathSettings(path, repos)),
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
