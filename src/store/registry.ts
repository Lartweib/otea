import type { DatabaseSync } from 'node:sqlite';
import type { RepoFingerprint } from '../core/repo.ts';
import { applyMigrations } from './migrations.ts';

// The user-level list of projects and the folders that lead to them. A project can have several
// paths (a product folder, or separate repos linked to one project); a path belongs to one project.
const REGISTRY_MIGRATIONS = [
  `
  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    storage TEXT NOT NULL CHECK (storage IN ('common', 'local')),
    data_dir TEXT NOT NULL
  );

  CREATE TABLE project_paths (
    path_key TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects (id),
    kind TEXT NOT NULL CHECK (kind IN ('folder', 'repo'))
  );

  CREATE INDEX project_paths_project_id ON project_paths (project_id);
  `,
  // What identified a linked repo when it was linked, so a relink can tell it is the same repo
  // even after the old folder is gone.
  `
  ALTER TABLE project_paths ADD COLUMN remote_url TEXT;
  ALTER TABLE project_paths ADD COLUMN root_commit TEXT;
  `,
];

export function migrateRegistry(db: DatabaseSync): void {
  applyMigrations(db, REGISTRY_MIGRATIONS);
}

export type Storage = 'common' | 'local';

export type RegisteredProject = { id: string; name: string; storage: Storage; dataDir: string };

export type PathKind = 'folder' | 'repo';

export type ProjectPath = RepoFingerprint & {
  path: string;
  pathKey: string;
  projectId: string;
  kind: PathKind;
};

type ProjectRow = { id: string; name: string; storage: Storage; data_dir: string };

type PathRow = {
  path: string;
  path_key: string;
  project_id: string;
  kind: PathKind;
  remote_url: string | null;
  root_commit: string | null;
};

export function insertRegisteredProject(db: DatabaseSync, project: RegisteredProject): void {
  db.prepare('INSERT INTO projects (id, name, storage, data_dir) VALUES (?, ?, ?, ?)').run(
    project.id,
    project.name,
    project.storage,
    project.dataDir,
  );
}

function toProject(row: ProjectRow): RegisteredProject {
  return { id: row.id, name: row.name, storage: row.storage, dataDir: row.data_dir };
}

export function selectRegisteredProject(
  db: DatabaseSync,
  id: string,
): RegisteredProject | undefined {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row && toProject(row);
}

export function selectRegisteredProjects(db: DatabaseSync): RegisteredProject[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY name, id').all() as ProjectRow[];
  return rows.map(toProject);
}

export function insertProjectPath(db: DatabaseSync, path: ProjectPath): void {
  db.prepare(
    `INSERT INTO project_paths (path_key, path, project_id, kind, remote_url, root_commit)
    VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(path.pathKey, path.path, path.projectId, path.kind, path.remoteUrl, path.rootCommit);
}

// Moves a link to another folder, keeping its project.
export function updateProjectPath(db: DatabaseSync, oldKey: string, path: ProjectPath): void {
  db.prepare(
    `UPDATE project_paths SET path_key = ?, path = ?, kind = ?, remote_url = ?, root_commit = ?
    WHERE path_key = ?`,
  ).run(path.pathKey, path.path, path.kind, path.remoteUrl, path.rootCommit, oldKey);
}

export function deleteProjectPath(db: DatabaseSync, pathKey: string): void {
  db.prepare('DELETE FROM project_paths WHERE path_key = ?').run(pathKey);
}

export function selectProjectPaths(db: DatabaseSync): ProjectPath[] {
  const rows = db.prepare('SELECT * FROM project_paths ORDER BY path_key').all() as PathRow[];
  return rows.map((row) => ({
    path: row.path,
    pathKey: row.path_key,
    projectId: row.project_id,
    kind: row.kind,
    remoteUrl: row.remote_url,
    rootCommit: row.root_commit,
  }));
}
