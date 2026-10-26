import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { OteaError } from '../core/errors.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import type { Context } from './context.ts';
import { loadPresets } from './presets.ts';

export type Project = Context & { root: string };

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

function databasePath(root: string): string {
  return join(root, OTEA_DIR, 'otea.db');
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

function open(root: string): Project {
  const db = openDatabase(databasePath(root));
  migrate(db);
  return { root, db, presets: loadPresets(root) };
}

export function initProject(cwd: string): Project {
  const { root, gitCommonDir } = locate(cwd);
  mkdirSync(join(root, OTEA_DIR), { recursive: true });
  if (gitCommonDir) excludeFromGit(gitCommonDir);
  return open(root);
}

export function openProject(cwd: string): Project {
  const { root } = locate(cwd);
  if (!existsSync(databasePath(root))) {
    throw new OteaError('not_found', `No Otea project at ${root}; run init first`);
  }
  return open(root);
}
