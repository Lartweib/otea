import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { longestContaining, pathKey } from '../core/path-key.ts';
import { openDatabase } from '../store/database.ts';
import {
  insertProjectPath,
  insertRegisteredProject,
  migrateRegistry,
  type PathKind,
  type ProjectPath,
  type RegisteredProject,
  selectProjectPaths,
  selectRegisteredProject,
  selectRegisteredProjects,
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

export function keyOf(path: string): { path: string; pathKey: string } {
  const real = realpathSync.native(path);
  return { path: real, pathKey: pathKey(real, process.platform) };
}

// Links an existing folder to a registered project. A folder leads to one project only.
export function addProjectPath(
  registry: DatabaseSync,
  projectId: string,
  path: string,
  kind: PathKind,
): ProjectPath {
  const entry = { ...keyOf(path), projectId, kind };
  const taken = selectProjectPaths(registry).find((linked) => linked.pathKey === entry.pathKey);
  if (taken) {
    throw new OteaError('already_exists', `${entry.path} is already linked to ${taken.projectId}`);
  }
  insertProjectPath(registry, entry);
  return entry;
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

export type ListedProject = RegisteredProject & { paths: Array<{ path: string; kind: PathKind }> };

export function listProjects(registry: DatabaseSync): ListedProject[] {
  const paths = selectProjectPaths(registry);
  return selectRegisteredProjects(registry).map((project) => ({
    ...project,
    paths: paths
      .filter((linked) => linked.projectId === project.id)
      .map(({ path, kind }) => ({ path, kind })),
  }));
}
