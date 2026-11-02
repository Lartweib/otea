import { mkdirSync, realpathSync } from 'node:fs';
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
} from '../store/registry.ts';
import type { Env } from './project.ts';

// The user-level Otea folder: OTEA_HOME, or ~/.otea on every OS.
export function oteaHome(env: Env = process.env): string {
  return env.OTEA_HOME ? resolve(env.OTEA_HOME) : join(homedir(), '.otea');
}

export function openRegistry(env: Env = process.env): DatabaseSync {
  const home = oteaHome(env);
  mkdirSync(home, { recursive: true });
  const db = openDatabase(join(home, 'registry.db'));
  migrateRegistry(db);
  return db;
}

export function registerProject(registry: DatabaseSync, project: RegisteredProject): void {
  insertRegisteredProject(registry, project);
}

function keyOf(path: string): { path: string; pathKey: string } {
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

// The project of the nearest linked folder at or above `path`.
export function projectAt(registry: DatabaseSync, path: string): RegisteredProject | undefined {
  const linked = longestContaining(selectProjectPaths(registry), keyOf(path).pathKey);
  return linked && selectRegisteredProject(registry, linked.projectId);
}
