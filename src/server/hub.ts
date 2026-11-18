import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { kindOf, type ListedProject, listProjects, withRegistry } from '../app/home.ts';
import { forgetLocalProject, localProjects } from '../app/machine.ts';
import {
  databasePath,
  type Env,
  openProject,
  openRegistered,
  oteaDir,
  type Project,
} from '../app/project.ts';
import type { PathKind, Storage } from '../store/registry.ts';

// The projects this computer's one server serves: every registered project, and the local projects
// (.otea/ in their folder) `otea serve` was run in. Each opens once and stays open while it serves.

export type ServedPath = { path: string; kind: PathKind; missing: boolean };

export type ServedProject = {
  id: string;
  name: string;
  storage: Storage;
  paths: ServedPath[];
  // Open, or why it could not be opened (its data is missing, say).
  project?: Project;
  unavailable?: string;
};

export type ProjectSource = {
  // Every project served, by name.
  list(): ServedProject[];
  // One project, opened, by id; none when it is not served (or cannot be opened).
  get(id: string): Project | undefined;
  close(): void;
};

// Projects already open, as a test serves them: the caller owns their databases.
export function openProjects(...projects: Project[]): ProjectSource {
  const served = (project: Project): ServedProject => ({
    id: project.identity.id,
    name: project.identity.name,
    storage: project.storage,
    paths: [{ path: project.root, kind: kindOf(project.root), missing: false }],
    project,
  });
  return {
    list: () => projects.map(served),
    get: (id) => projects.find((project) => project.identity.id === id),
    close: () => {},
  };
}

const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

const byName = (a: ServedProject, b: ServedProject) =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

// The registry and the local projects in machine.db, read again on every call (another process
// registers a project, or `otea serve` adds a local one, while this one runs).
export function machineProjects(env: Env, machine: DatabaseSync): ProjectSource {
  const opened = new Map<string, Project>();

  const keep = (id: string, open: () => Project): Project => {
    const held = opened.get(id);
    if (held) return held;
    const project = open();
    opened.set(id, project);
    return project;
  };

  const registered = (listed: ListedProject): ServedProject => {
    const { id, name, storage, paths } = listed;
    const base = { id, name, storage, paths };
    if (storage === 'common' && !existsSync(databasePath(listed.dataDir))) {
      return { ...base, unavailable: `The data of ${name} is missing (${listed.dataDir})` };
    }
    const root = paths.find((path) => !path.missing)?.path ?? paths[0]?.path ?? listed.dataDir;
    try {
      return { ...base, project: keep(id, () => openRegistered(listed, root)) };
    } catch (error) {
      return { ...base, unavailable: failure(error) };
    }
  };

  const local = (id: string, root: string): ServedProject | undefined => {
    // Gone (moved to common storage, or its folder deleted): no longer served.
    if (!existsSync(databasePath(oteaDir(root)))) {
      forgetLocalProject(machine, id);
      return undefined;
    }
    try {
      const project = keep(id, () => openProject(root, { ...env, OTEA_PROJECT: root }));
      if (project.identity.id !== id) return undefined;
      const { name } = project.identity;
      return {
        id,
        name,
        storage: 'local',
        paths: [{ path: root, kind: kindOf(root), missing: false }],
        project,
      };
    } catch (error) {
      return {
        id,
        name: id,
        storage: 'local',
        paths: [{ path: root, kind: 'folder', missing: true }],
        unavailable: failure(error),
      };
    }
  };

  const list = (): ServedProject[] => {
    const listed = withRegistry(env, listProjects) ?? [];
    const served = listed.map(registered);
    for (const { id, root } of localProjects(machine)) {
      if (served.some((each) => each.id === id)) continue;
      const one = local(id, root);
      if (one) served.push(one);
    }
    return served.sort(byName);
  };

  return {
    list,
    get: (id) => opened.get(id) ?? list().find((each) => each.id === id)?.project,
    close: () => {
      for (const project of opened.values()) project.db.close();
      opened.clear();
    },
  };
}
