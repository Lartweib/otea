import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { PROJECT_ID_RANDOM_BYTES, projectId } from '../core/project-id.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import {
  insertProjectIdentity,
  type ProjectIdentity,
  selectProjectIdentity,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { loadPresets } from './presets.ts';

export type Project = Context & { root: string; identity: ProjectIdentity };

type Location = { root: string; gitCommonDir?: string };

const OTEA_DIR = '.otea';
const EXCLUDE_ENTRY = `${OTEA_DIR}/`;

function gitCommonDir(cwd: string): string | undefined {
  try {
    const output = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return resolve(cwd, output.trim());
  } catch {
    return undefined;
  }
}

function locate(cwd: string): Location {
  const commonDir = gitCommonDir(cwd);
  if (!commonDir) return { root: resolve(cwd) };
  return { root: dirname(commonDir), gitCommonDir: commonDir };
}

export function oteaDir(root: string): string {
  return join(root, OTEA_DIR);
}

function databasePath(root: string): string {
  return join(oteaDir(root), 'otea.db');
}

function excludeFromGit(gitCommonDir: string): void {
  const infoDir = join(gitCommonDir, 'info');
  const excludePath = join(infoDir, 'exclude');
  const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  if (current.split(/\r?\n/).some((line) => line.trim() === EXCLUDE_ENTRY)) return;
  mkdirSync(infoDir, { recursive: true });
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  appendFileSync(excludePath, `${separator}${EXCLUDE_ENTRY}\n`);
}

// Named after its folder. A database from before identities gets one the first time it is opened;
// reading first keeps every later open from taking the write lock.
function ensureIdentity(db: DatabaseSync, root: string): ProjectIdentity {
  const existing = selectProjectIdentity(db);
  if (existing) return existing;
  const name = basename(root) || root;
  insertProjectIdentity(db, { id: projectId(name, randomBytes(PROJECT_ID_RANDOM_BYTES)), name });
  return selectProjectIdentity(db) as ProjectIdentity;
}

function open(root: string): Project {
  const db = openDatabase(databasePath(root));
  migrate(db);
  return { root, db, presets: loadPresets(root), identity: ensureIdentity(db, root) };
}

export type Env = Readonly<Record<string, string | undefined>>;

// The nearest folder, from `start` up to the filesystem root, holding a project database. Matching
// the database rather than `.otea/` keeps a user-level `~/.otea` from passing for a project.
function findAbove(start: string): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(databasePath(dir))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

export type InitOptions = { here?: boolean };

// Creates the project at the repo root (or the folder itself outside git). Inside a folder that a
// project above already covers, it refuses unless `here` asks for a separate project.
export function initProject(cwd: string, options: InitOptions = {}): Project {
  const { root, gitCommonDir } = locate(cwd);
  const existing = findAbove(root);
  if (existing !== undefined && existing !== root && !options.here) {
    throw new OteaError(
      'already_exists',
      `The Otea project at ${existing} already covers ${root}; run init --here to create a separate project at ${root}`,
    );
  }
  mkdirSync(join(root, OTEA_DIR), { recursive: true });
  if (gitCommonDir) excludeFromGit(gitCommonDir);
  return open(root);
}

// Opens the project named by OTEA_PROJECT, or else the nearest one from the repo root up.
export function openProject(cwd: string, env: Env = process.env): Project {
  const override = env.OTEA_PROJECT;
  if (override) {
    const root = resolve(cwd, override);
    if (!existsSync(databasePath(root))) {
      throw new OteaError('not_found', `No Otea project at ${root} (OTEA_PROJECT); run init first`);
    }
    return open(root);
  }
  const { root } = locate(cwd);
  const found = findAbove(root);
  if (found === undefined) {
    throw new OteaError('not_found', `No Otea project at ${root} or above it; run init first`);
  }
  return open(found);
}
