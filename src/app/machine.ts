import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../store/database.ts';
import {
  deleteLocalProject,
  type LocalProjectRow,
  migrateMachine,
  selectLocalProjects,
  upsertLocalProject,
} from '../store/machine.ts';
import { oteaHome } from './home.ts';
import type { Env } from './project.ts';

// This computer's one Otea server keeps what is not a project's in the Otea home: the paired
// devices, the phone settings and the notification targets (machine.db), the browser's sign-in
// key (ui-token), the Web Push keys (push-keys.json) and where it runs (serve.json). A paired device
// is the person's: it sees every project this server serves, and revoking it is what protects them.

export const machineDir = (env: Env = process.env): string => oteaHome(env);

export function openMachine(env: Env = process.env): DatabaseSync {
  const dir = machineDir(env);
  mkdirSync(dir, { recursive: true });
  const db = openDatabase(join(dir, 'machine.db'));
  migrateMachine(db);
  return db;
}

// A machine store that lives as long as its connection (tests, and a server given none).
export function memoryMachine(): DatabaseSync {
  const db = openDatabase(':memory:');
  migrateMachine(db);
  return db;
}

export type LocalProject = LocalProjectRow;

export function rememberLocalProject(db: DatabaseSync, project: LocalProject, now = new Date()) {
  upsertLocalProject(db, project, now.toISOString());
}

export const localProjects = (db: DatabaseSync): LocalProject[] => selectLocalProjects(db);

export function forgetLocalProject(db: DatabaseSync, id: string): void {
  deleteLocalProject(db, id);
}

export function withMachine<T>(env: Env, use: (db: DatabaseSync) => T): T {
  const db = openMachine(env);
  try {
    return use(db);
  } finally {
    db.close();
  }
}
