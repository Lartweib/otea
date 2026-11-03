import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { longestContaining, pathKey } from '../core/path-key.ts';
import { compareRepos, type RepoFingerprint, type RepoMatch } from '../core/repo.ts';
import { openDatabase, transaction } from '../store/database.ts';
import {
  deleteProjectPath,
  insertProjectPath,
  insertRegisteredProject,
  migrateRegistry,
  type PathKind,
  type ProjectPath,
  type RegisteredProject,
  selectProjectPaths,
  selectRegisteredProject,
  selectRegisteredProjects,
  updateProjectPath,
} from '../store/registry.ts';
import type { Env } from './project.ts';

// The user-level Otea folder: OTEA_HOME, or ~/.otea on every OS.
export function oteaHome(env: Env = process.env): string {
  return env.OTEA_HOME ? resolve(env.OTEA_HOME) : join(homedir(), '.otea');
}

function registryPath(env: Env): string {
  return join(oteaHome(env), 'registry.db');
}

export function openRegistry(env: Env = process.env): DatabaseSync {
  mkdirSync(oteaHome(env), { recursive: true });
  const db = openDatabase(registryPath(env));
  migrateRegistry(db);
  return db;
}

// Runs `use` on the registry, or returns undefined without creating it when there is none yet.
export function withRegistry<T>(env: Env, use: (registry: DatabaseSync) => T): T | undefined {
  if (!existsSync(registryPath(env))) return undefined;
  const registry = openRegistry(env);
  try {
    return use(registry);
  } finally {
    registry.close();
  }
}

export function registerProject(registry: DatabaseSync, project: RegisteredProject): void {
  insertRegisteredProject(registry, project);
}

// The real path of a folder, or the resolved one when it no longer exists (a moved repo).
export function keyOf(path: string): { path: string; pathKey: string } {
  const real = existsSync(path) ? realpathSync.native(path) : resolve(path);
  return { path: real, pathKey: pathKey(real, process.platform) };
}

export const kindOf = (path: string): PathKind =>
  existsSync(join(path, '.git')) ? 'repo' : 'folder';

function git(cwd: string, ...args: string[]): string | null {
  try {
    const output = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

export function repoFingerprint(path: string): RepoFingerprint {
  const roots = git(path, 'rev-list', '--max-parents=0', 'HEAD');
  return {
    remoteUrl: git(path, 'config', '--get', 'remote.origin.url'),
    rootCommit: roots?.split(/\s+/).sort().join(' ') ?? null,
  };
}

function linkedFolder(path: string, projectId: string, kind: PathKind): ProjectPath {
  if (!existsSync(path)) throw new OteaError('not_found', `No folder at ${path}`);
  const fingerprint: RepoFingerprint =
    kind === 'repo' ? repoFingerprint(path) : { remoteUrl: null, rootCommit: null };
  return { ...keyOf(path), projectId, kind, ...fingerprint };
}

function assertFree(registry: DatabaseSync, pathKey: string, path: string): void {
  const taken = selectProjectPaths(registry).find((linked) => linked.pathKey === pathKey);
  if (taken) {
    throw new OteaError('already_exists', `${path} is already linked to ${taken.projectId}`);
  }
}

// Links an existing folder to a registered project. A folder leads to one project only.
export function addProjectPath(
  registry: DatabaseSync,
  projectId: string,
  path: string,
  kind: PathKind,
): ProjectPath {
  const entry = linkedFolder(path, projectId, kind);
  assertFree(registry, entry.pathKey, entry.path);
  insertProjectPath(registry, entry);
  return entry;
}

function linkedExactly(registry: DatabaseSync, path: string): ProjectPath {
  const { pathKey: key, path: resolved } = keyOf(path);
  const link = selectProjectPaths(registry).find((linked) => linked.pathKey === key);
  if (!link) throw new OteaError('not_found', `${resolved} is not linked to any project`);
  return link;
}

export type Relinked = { link: ProjectPath; from: string; match: RepoMatch };

// Points a link at the folder a repo moved to. The new folder must hold the same repo: same origin
// URL or same root commit, compared with the old folder if it still exists, else with what was
// recorded when it was linked. `force` links it anyway when they differ.
export function relinkProjectPath(
  registry: DatabaseSync,
  from: string,
  to: string,
  force = false,
): Relinked {
  const old = linkedExactly(registry, from);
  const entry = linkedFolder(to, old.projectId, kindOf(to));
  const before = existsSync(old.path) && old.kind === 'repo' ? repoFingerprint(old.path) : old;
  const match = compareRepos(before, entry);
  if (match === 'different' && !force) {
    throw new OteaError(
      'different_repo',
      `${entry.path} is not the repo linked at ${old.path} (no matching remote URL or root commit); pass --force to relink anyway`,
    );
  }
  if (entry.pathKey !== old.pathKey) assertFree(registry, entry.pathKey, entry.path);
  transaction(registry, () => updateProjectPath(registry, old.pathKey, entry));
  return { link: entry, from: old.path, match };
}

export type Forgotten = { link: ProjectPath; remaining: number };

// Unlinks a folder. The project and its data stay; with no folder left nothing resolves to it.
export function forgetProjectPath(registry: DatabaseSync, path: string): Forgotten {
  const link = linkedExactly(registry, path);
  deleteProjectPath(registry, link.pathKey);
  const remaining = selectProjectPaths(registry).filter((p) => p.projectId === link.projectId);
  return { link, remaining: remaining.length };
}

export type Link = { link: ProjectPath; project: RegisteredProject };

// The nearest linked folder at or above `path`, with its project.
export function linkAt(registry: DatabaseSync, path: string): Link | undefined {
  const link = longestContaining(selectProjectPaths(registry), keyOf(path).pathKey);
  const project = link && selectRegisteredProject(registry, link.projectId);
  return link && project && { link, project };
}

export function projectAt(registry: DatabaseSync, path: string): RegisteredProject | undefined {
  return linkAt(registry, path)?.project;
}

// A registered project by id, or by name when no other project has it.
export function findProject(registry: DatabaseSync, ref: string): RegisteredProject {
  const projects = selectRegisteredProjects(registry);
  const byId = projects.find((project) => project.id === ref);
  if (byId) return byId;
  const named = projects.filter((project) => project.name === ref);
  if (named.length === 1 && named[0]) return named[0];
  if (named.length > 1) {
    const ids = named.map((project) => project.id).join(', ');
    throw new OteaError('invalid_name', `Several projects are named "${ref}" (${ids}); use its id`);
  }
  throw new OteaError('not_found', `No registered project "${ref}"; run otea projects list`);
}

export type ListedProject = RegisteredProject & {
  paths: Array<{ path: string; kind: PathKind; missing: boolean }>;
};

export function listProjects(registry: DatabaseSync): ListedProject[] {
  const paths = selectProjectPaths(registry);
  return selectRegisteredProjects(registry).map((project) => ({
    ...project,
    paths: paths
      .filter((linked) => linked.projectId === project.id)
      .map(({ path, kind }) => ({ path, kind, missing: !existsSync(path) })),
  }));
}
