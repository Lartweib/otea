import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { OteaError } from '../core/errors.ts';
import { repoIdentity } from '../core/repo.ts';
import { transaction } from '../store/database.ts';
import {
  deleteRepo,
  insertRepo,
  markReposRead,
  type RepoRecord,
  renameRepo,
  selectRepos,
  selectReposRead,
} from '../store/queries.ts';
import type { PathKind } from '../store/registry.ts';
import { repoOfItem, sameRepo } from './gates.ts';
import { kindOf, listProjects, repoFingerprint, withRegistry } from './home.ts';
import { listItems } from './items.ts';
import { liveBoards } from './next.ts';
import type { Env, Project } from './project.ts';

// A project knows its repos by what identifies them wherever they are cloned (their origin URL, or
// their root commit without one), under the name its items give them, the repo task's `repo`
// field. So a clone in another folder (api-copy) is still api, and a gate never takes a folder's
// name for a repo's.

export type Repo = RepoRecord;

// A repo Otea cannot tell is one of the project's, where a gate checks: the gate refuses rather
// than allow what it cannot match to an item.
export class UnknownRepo extends Error {}

const SKIPPED = new Set(['node_modules', '.git', '.otea']);

// The git repos at most two folders below a parent folder.
export function reposInside(folder: string, depth = 2): string[] {
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

// The top folder of the git checkout at `path`; undefined outside one.
function checkoutTop(path: string): string | undefined {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return top ? resolve(top) : undefined;
  } catch {
    return undefined;
  }
}

// What identifies the repo checked out at `path`; null when it has no origin and no commit.
export function identityAt(path: string): string | null {
  return repoIdentity(repoFingerprint(path));
}

// The folders that lead to the project, as linked in the registry, or its own folder.
function projectFolders(project: Project, env: Env): Array<{ path: string; kind: PathKind }> {
  const listed = withRegistry(env, listProjects)?.find(({ id }) => id === project.identity.id);
  if (listed) return listed.paths.filter(({ missing }) => !missing);
  return [{ path: project.root, kind: kindOf(project.root) }];
}

// The repos at a folder: the folder itself when it is a repo, or the ones below it.
const reposAt = ({ path, kind }: { path: string; kind: PathKind }): string[] =>
  kind === 'repo' ? [path] : reposInside(path);

// Registers the repos at `folders` that the project does not know yet, each under its folder's
// name. Where two folders hold the same repo under different names (api and a clone in api-copy),
// the name its items already give it wins; and a name two repos would take goes to neither. A repo
// left out is told apart by a gate, which refuses in it until `otea repos add` names it.
export function readReposIn(project: Project, folders: readonly string[]): Repo[] {
  const known = selectRepos(project.db);
  const identities = new Set(known.map(({ identity }) => identity));
  const names = new Set(known.map(({ name }) => name));
  const found = new Map<string, Set<string>>();
  for (const folder of folders) {
    const identity = identityAt(folder);
    if (identity === null || identities.has(identity)) continue;
    const named = found.get(identity) ?? new Set<string>();
    named.add(basename(folder));
    found.set(identity, named);
  }
  if (found.size === 0) return [];
  const used = itemRepoNames(project);
  const chosen: Repo[] = [];
  for (const [identity, named] of found) {
    const candidates = [...named];
    const pick = candidates.length === 1 ? candidates : candidates.filter((n) => used.has(n));
    if (pick.length === 1 && pick[0] !== undefined) chosen.push({ name: pick[0], identity });
  }
  const taken = (name: string) => chosen.filter((repo) => repo.name === name).length > 1;
  const added = chosen.filter(({ name }) => !names.has(name) && !taken(name));
  transaction(project.db, () => {
    for (const repo of added) insertRepo(project.db, repo);
  });
  return added;
}

function itemRepoNames(project: Project): Set<string> {
  const boards = liveBoards(project);
  const names = listItems(project).map((item) => repoOfItem(project, item, boards));
  return new Set(names.filter((name): name is string => typeof name === 'string'));
}

// The project's repos. The first time, the repos at its folders are read in (readReposIn).
export function listRepos(project: Project, env: Env = process.env): Repo[] {
  if (!selectReposRead(project.db)) {
    readReposIn(project, projectFolders(project, env).flatMap(reposAt));
    markReposRead(project.db);
  }
  return selectRepos(project.db);
}

// The checkouts of the repo the project names `name` (in any case) in the project's folders (the
// folders linked to it, or the repos below them); none for a name the project does not know.
export function checkoutsOf(project: Project, name: string, env: Env = process.env): string[] {
  const repo = listRepos(project, env).find((each) => sameRepo(each.name, name));
  if (!repo) return [];
  const folders = projectFolders(project, env).flatMap(reposAt);
  return [...new Set(folders)].filter((folder) => identityAt(folder) === repo.identity);
}

// Registers the repos at a folder just linked to the project (the folder, or the repos below it),
// after the first read of the others, so a clone never takes the name of the repo it is a clone of.
export function readReposAtFolder(project: Project, path: string, env: Env = process.env): Repo[] {
  const before = new Set(selectRepos(project.db).map(({ identity }) => identity));
  listRepos(project, env);
  readReposIn(project, reposAt({ path, kind: kindOf(path) }));
  return selectRepos(project.db).filter(({ identity }) => !before.has(identity));
}

// The name the project gives the repo checked out at `cwd`. Throws a plain error outside a git
// checkout (nothing to check), and UnknownRepo for a checkout the project does not know.
export function repoNameAt(project: Project, cwd: string, env: Env = process.env): string {
  const top = checkoutTop(cwd);
  if (top === undefined) throw new Error(`${cwd} is not in a git checkout`);
  const identity = identityAt(top);
  const repo = identity && listRepos(project, env).find((each) => each.identity === identity);
  if (repo) return repo.name;
  const why =
    identity === null
      ? 'it has no origin remote and no commit to tell it by'
      : `it is not one of the repos of ${project.identity.name}`;
  throw new UnknownRepo(
    `cannot tell which repo ${top} is (${why}); name it with otea repos add --name <repo>`,
  );
}

// Registers the repo checked out at `path`, under `name` or its folder's name; a repo already
// registered keeps its name unless `name` renames it. Every clone of a repo is the same repo.
export function addRepo(
  project: Project,
  path: string,
  name?: string,
  env: Env = process.env,
): Repo {
  const top = checkoutTop(path);
  if (top === undefined) throw new OteaError('not_found', `${path} is not in a git checkout`);
  const identity = identityAt(top);
  if (identity === null) {
    throw new OteaError(
      'invalid_name',
      `${top} has no origin remote and no commit to tell it by; add a remote or commit first`,
    );
  }
  const label = (name ?? '').trim();
  if (name !== undefined && label === '')
    throw new OteaError('invalid_name', 'Give the repo a name');
  const repos = listRepos(project, env);
  const existing = repos.find((repo) => repo.identity === identity);
  const wanted = label || existing?.name || basename(top);
  if (existing?.name === wanted) return existing;
  // A gate check matches repo names whatever their case, so a case apart is the same name.
  const holder = repos.find((repo) => repo.identity !== identity && sameRepo(repo.name, wanted));
  if (holder) {
    throw new OteaError(
      'already_exists',
      `"${holder.name}" already names another repo (${holder.identity}); give this one another name with --name`,
    );
  }
  const repo = { name: wanted, identity };
  if (existing) renameRepo(project.db, identity, wanted);
  else insertRepo(project.db, repo);
  return repo;
}

// Forgets a repo by name; its items keep their values.
export function removeRepo(project: Project, name: string, env: Env = process.env): Repo {
  const repo = listRepos(project, env).find((each) => sameRepo(each.name, name));
  if (!repo) throw new OteaError('not_found', `No repo named "${name}"; run otea repos`);
  deleteRepo(project.db, repo.name);
  return repo;
}
