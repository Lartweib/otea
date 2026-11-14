import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { OteaError } from '../core/errors.ts';
import {
  integrityCheck,
  openDatabase,
  type TableSummary,
  tableSummary,
  transaction,
  vacuumInto,
} from '../store/database.ts';
import { selectProjectIdentity } from '../store/queries.ts';
import {
  deleteRegisteredProject,
  selectProjectPaths,
  selectRegisteredProject,
} from '../store/registry.ts';
import {
  addProjectPath,
  keyOf,
  kindOf,
  linkAt,
  openRegistry,
  oteaHome,
  registerProject,
  withRegistry,
} from './home.ts';
import { restrictToOwner } from './owner-only.ts';
import {
  databasePath,
  type Env,
  excludeFromGit,
  gitCommonDir,
  openProject,
  oteaDir,
  type Project,
} from './project.ts';

const BACKUP_PREFIX = '.otea.migrated-';

// The folders and files copied next to the database; ui-token and serve.json are made again when served
// (ensureUiToken keeps the new token to its owner).
// The push keys go along: the phones' subscriptions are bound to them.
const PUSH_KEYS = 'push-keys.json';
const COPIED = ['evidence', 'presets', PUSH_KEYS];

export type MigrationReport = {
  // migrated: moved now; finished: an earlier run had copied and registered it, this one moved the
  // old folder aside; already: nothing left to do.
  status: 'migrated' | 'finished' | 'already';
  id: string;
  root: string;
  to: string;
  from: string | null;
  backup: string | null;
  tables: TableSummary;
  files: number;
  undo: string[];
};

function summaryOf(dataDir: string): TableSummary {
  const db = openDatabase(databasePath(dataDir));
  try {
    return tableSummary(db);
  } finally {
    db.close();
  }
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  if (!statSync(dir).isDirectory()) return 1;
  return readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile())
    .length;
}

function backupName(now: Date): string {
  return `${BACKUP_PREFIX}${now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}`;
}

function unregister(env: Env, id: string): void {
  withRegistry(env, (registry) => deleteRegisteredProject(registry, id));
}

function undoSteps(root: string, from: string, backup: string, to: string): string[] {
  return [
    `otea projects forget ${root}`,
    `rename ${backup} back to ${from}`,
    `delete ${to} once you no longer need it`,
  ];
}

// Moves the old folder aside, unless another process still holds it (Windows refuses the rename)
// or wrote to it since it was copied; either way the move is undone and the caller told.
function moveAside(from: string, to: string, root: string, now: Date): string {
  const backup = join(root, backupName(now));
  try {
    renameSync(from, backup);
  } catch {
    throw new OteaError('in_use', `${from} is in use by another process; stop it and run again`);
  }
  if (!isDeepStrictEqual(summaryOf(backup), summaryOf(to))) {
    renameSync(backup, from);
    throw new OteaError('in_use', `${from} was written to during the migration; run it again`);
  }
  const commonDir = gitCommonDir(root);
  if (commonDir) excludeFromGit(commonDir, `${BACKUP_PREFIX}*/`);
  return backup;
}

function migrate(project: Project, env: Env, now: Date): MigrationReport {
  const { root, identity } = project;
  const from = project.dataDir;
  const to = join(oteaHome(env), 'data', identity.id);
  withRegistry(env, (registry) => {
    const link = linkAt(registry, root);
    if (link && link.link.pathKey === keyOf(root).pathKey) {
      throw new OteaError('already_exists', `${root} is already linked to ${link.project.id}`);
    }
    if (!selectRegisteredProject(registry, identity.id)) return;
    // Left registered by an undone migration: reusable once its copy is gone, as the undo says.
    const linked = selectProjectPaths(registry).some((path) => path.projectId === identity.id);
    if (linked || existsSync(to)) {
      throw new OteaError(
        'already_exists',
        `${identity.id} is already registered with data in ${to}; delete that folder first if it is an undone migration`,
      );
    }
    deleteRegisteredProject(registry, identity.id);
  });
  // A folder left by a run that failed before registering holds nothing the source lacks.
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  try {
    vacuumInto(project.db, databasePath(to));
    const copy = openDatabase(databasePath(to));
    let tables: TableSummary;
    try {
      const integrity = integrityCheck(copy);
      if (integrity !== 'ok') throw new Error(`The copy failed its integrity check: ${integrity}`);
      tables = tableSummary(copy);
    } finally {
      copy.close();
    }
    if (!isDeepStrictEqual(tables, tableSummary(project.db))) {
      throw new OteaError('in_use', `${from} was written to during the copy; run it again`);
    }
    for (const name of COPIED) {
      if (existsSync(join(from, name)))
        cpSync(join(from, name), join(to, name), { recursive: true });
    }
    // A copy takes the new folder's ACL on Windows: the push keys are kept to their owner again.
    if (existsSync(join(to, PUSH_KEYS))) restrictToOwner(join(to, PUSH_KEYS));
    project.db.close();
    const registry = openRegistry(env);
    try {
      transaction(registry, () => {
        registerProject(registry, { ...identity, storage: 'common', dataDir: to });
        addProjectPath(registry, identity.id, root, kindOf(root));
      });
    } finally {
      registry.close();
    }
    let backup: string;
    try {
      backup = moveAside(from, to, root, now);
    } catch (error) {
      unregister(env, identity.id);
      throw error;
    }
    const files = COPIED.reduce((sum, name) => sum + countFiles(join(to, name)), 0);
    const undo = undoSteps(root, from, backup, to);
    return { status: 'migrated', id: identity.id, root, to, from, backup, tables, files, undo };
  } catch (error) {
    rmSync(to, { recursive: true, force: true });
    throw error;
  }
}

// The project is already common. A local copy of the same project still at its root means an
// earlier run stopped after registering; it is moved aside once it matches the common data.
function finish(project: Project, now: Date): MigrationReport {
  const { root, identity, dataDir: to } = project;
  const from = oteaDir(root);
  const tables = tableSummary(project.db);
  const report = { id: identity.id, root, to, tables, files: 0, undo: [] };
  if (!existsSync(databasePath(from))) {
    return { ...report, status: 'already', from: null, backup: null };
  }
  const local = openDatabase(databasePath(from));
  const sameProject = selectProjectIdentity(local)?.id === identity.id;
  local.close();
  if (!sameProject) return { ...report, status: 'already', from: null, backup: null };
  if (!isDeepStrictEqual(summaryOf(from), tables)) {
    throw new OteaError(
      'in_use',
      `${from} differs from the migrated copy in ${to}; it may hold writes made after the migration, so keep the one you want by hand`,
    );
  }
  project.db.close();
  const backup = moveAside(from, to, root, now);
  return { ...report, status: 'finished', from, backup, undo: undoSteps(root, from, backup, to) };
}

// Moves the local project the working directory resolves to into common storage. Never run
// implicitly: only `otea migrate --to common` calls it.
export function migrateToCommon(
  cwd: string,
  env: Env = process.env,
  now = new Date(),
): MigrationReport {
  const project = openProject(cwd, env);
  try {
    return project.storage === 'common' ? finish(project, now) : migrate(project, env, now);
  } finally {
    if (project.db.isOpen) project.db.close();
  }
}
