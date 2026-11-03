import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { assertIconName } from '../core/icons.ts';
import { PROJECT_ID_RANDOM_BYTES, projectId } from '../core/project-id.ts';
import { openDatabase, transaction } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import {
  insertProjectIdentity,
  type ProjectIdentity,
  selectProjectIcon,
  selectProjectIdentity,
  updateProjectIcon,
} from '../store/queries.ts';
import {
  type ProjectPath,
  type RegisteredProject,
  type Storage,
  selectRegisteredProject,
  selectRegisteredProjects,
} from '../store/registry.ts';
import { readProjectBlueprint } from './blueprints.ts';
import { nameImplicitTypes } from './collections.ts';
import type { Context } from './context.ts';
import {
  addProjectPath,
  findProject,
  keyOf,
  kindOf,
  type Link,
  linkAt,
  openRegistry,
  oteaHome,
  registerProject,
  withRegistry,
} from './home.ts';
import { loadPresets } from './presets.ts';

// `root` is the folder the project was found from (where AGENTS.md and .mcp.json go); `dataDir`
// holds its database, evidence, presets and blueprint: `.otea/` in the root for a local project, a folder in
// the Otea home for a common one.
export type Project = Context & {
  root: string;
  dataDir: string;
  storage: Storage;
  identity: ProjectIdentity;
};

type Found = { root: string; dataDir: string; storage: Storage };

type Location = { root: string; gitCommonDir?: string };

const OTEA_DIR = '.otea';
const EXCLUDE_ENTRY = `${OTEA_DIR}/`;

export function gitCommonDir(cwd: string): string | undefined {
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

export function databasePath(dataDir: string): string {
  return join(dataDir, 'otea.db');
}

function hasLocalProject(dir: string): boolean {
  return existsSync(databasePath(oteaDir(dir)));
}

export function excludeFromGit(gitCommonDir: string, entry = EXCLUDE_ENTRY): void {
  const infoDir = join(gitCommonDir, 'info');
  const excludePath = join(infoDir, 'exclude');
  const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  if (current.split(/\r?\n/).some((line) => line.trim() === entry)) return;
  mkdirSync(infoDir, { recursive: true });
  const separator = current === '' || current.endsWith('\n') ? '' : '\n';
  appendFileSync(excludePath, `${separator}${entry}\n`);
}

// Named after its folder.
function newIdentity(root: string): ProjectIdentity {
  const name = basename(root) || root;
  return { id: projectId(name, randomBytes(PROJECT_ID_RANDOM_BYTES)), name };
}

// A database from before identities gets one the first time it is opened; reading first keeps
// every later open from taking the write lock.
function ensureIdentity(db: DatabaseSync, identity: () => ProjectIdentity): ProjectIdentity {
  const existing = selectProjectIdentity(db);
  if (existing) return existing;
  insertProjectIdentity(db, identity());
  return selectProjectIdentity(db) as ProjectIdentity;
}

function open(found: Found, identity = () => newIdentity(found.root)): Project {
  const db = openDatabase(databasePath(found.dataDir));
  migrate(db);
  const presets = loadPresets(found.dataDir);
  nameImplicitTypes({ db, presets });
  return {
    ...found,
    db,
    presets,
    blueprint: readProjectBlueprint(found.dataDir)?.blueprint,
    identity: ensureIdentity(db, identity),
  };
}

// A common project's data lives apart from its folders, so it can go missing on its own.
function openFound(found: Found): Project {
  if (found.storage === 'common' && !existsSync(databasePath(found.dataDir))) {
    throw new OteaError('not_found', `The data of the Otea project at ${found.root} is missing`);
  }
  return open(found);
}

// Opens a registered project's data, as seen from `root` (one of its folders).
export function openRegistered(project: RegisteredProject, root: string): Project {
  return openFound({ root, dataDir: project.dataDir, storage: project.storage });
}

export type Env = Readonly<Record<string, string | undefined>>;

const local = (root: string): Found => ({ root, dataDir: oteaDir(root), storage: 'local' });

const linked = ({ link, project }: Link): Found => ({
  root: link.path,
  dataDir: project.dataDir,
  storage: project.storage,
});

// The nearest folder, from `start` up to the filesystem root, holding a local project database.
// Matching the database rather than `.otea/` keeps a user-level `~/.otea` from passing for one.
function findAbove(start: string): string | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    if (hasLocalProject(dir)) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

// The nearest project: the deepest of the registered folders containing `cwd` or the repo `root`,
// and the local project found walking up from `root`. On a tie the registered folder wins.
function nearest(cwd: string, root: string, env: Env): Found | undefined {
  const links = withRegistry(env, (registry) => [linkAt(registry, cwd), linkAt(registry, root)]);
  const candidates = (links ?? []).flatMap((link) =>
    link ? [{ found: linked(link), length: link.link.pathKey.length }] : [],
  );
  const above = findAbove(root);
  if (above !== undefined)
    candidates.push({ found: local(above), length: keyOf(above).pathKey.length });
  let best: (typeof candidates)[number] | undefined;
  for (const candidate of candidates) {
    if (!best || candidate.length > best.length) best = candidate;
  }
  return best?.found;
}

const samePath = (a: string, b: string) => keyOf(a).pathKey === keyOf(b).pathKey;

// OTEA_PROJECT names a folder holding a local project, a registered folder, or a project id.
function named(cwd: string, value: string, env: Env): Found {
  const path = resolve(cwd, value);
  if (hasLocalProject(path)) return local(path);
  const found = withRegistry(env, (registry) => {
    const link = existsSync(path) ? linkAt(registry, path) : undefined;
    if (link && samePath(link.link.path, path)) return linked(link);
    const project = selectRegisteredProject(registry, value);
    return (
      project && { root: locate(cwd).root, dataDir: project.dataDir, storage: project.storage }
    );
  });
  if (!found) {
    throw new OteaError('not_found', `No Otea project at ${path} (OTEA_PROJECT); run init first`);
  }
  return found;
}

// Opens the project named by OTEA_PROJECT, or else the nearest one to the working directory.
export function openProject(cwd: string, env: Env = process.env): Project {
  const override = env.OTEA_PROJECT;
  if (override) return openFound(named(cwd, override, env));
  const { root } = locate(cwd);
  const found = nearest(cwd, root, env);
  if (found === undefined) {
    const registered = withRegistry(env, (registry) => selectRegisteredProjects(registry).length);
    const join = registered
      ? '\nTo use an existing project instead, run otea init --join <id> (ids: otea projects list)'
      : '';
    throw new OteaError(
      'not_found',
      `No Otea project at ${root} or above it; run init first${join}`,
    );
  }
  return openFound(found);
}

export type InitOptions = { here?: boolean; local?: boolean; join?: string };

function createLocal({ root, gitCommonDir }: Location): Project {
  mkdirSync(oteaDir(root), { recursive: true });
  if (gitCommonDir) excludeFromGit(gitCommonDir);
  return open(local(root));
}

// Common storage leaves no trace in the folder: the data goes to the Otea home and the registry
// links the folder to it.
function createCommon({ root }: Location, env: Env): Project {
  const identity = newIdentity(root);
  const dataDir = join(oteaHome(env), 'data', identity.id);
  const registry = openRegistry(env);
  try {
    transaction(registry, () => {
      registerProject(registry, { ...identity, storage: 'common', dataDir });
      addProjectPath(registry, identity.id, root, kindOf(root));
    });
  } finally {
    registry.close();
  }
  mkdirSync(dataDir, { recursive: true });
  return open({ root, dataDir, storage: 'common' }, () => identity);
}

// Links `path` to a registered project; linking it again to the same project changes nothing.
function link(registry: DatabaseSync, project: RegisteredProject, path: string): ProjectPath {
  if (hasLocalProject(path)) {
    throw new OteaError('already_exists', `${path} has its own Otea project in ${OTEA_DIR}/`);
  }
  const current = linkAt(registry, path);
  if (current && samePath(current.link.path, path) && current.project.id === project.id) {
    return current.link;
  }
  return addProjectPath(registry, project.id, path, kindOf(path));
}

// Links an existing folder (another repo, say) to a registered project.
export function addPathToProject(path: string, ref: string, env: Env = process.env): ProjectPath {
  const registry = openRegistry(env);
  try {
    return link(registry, findProject(registry, ref), path);
  } finally {
    registry.close();
  }
}

function joinProject({ root }: Location, ref: string, env: Env): Project {
  const registry = openRegistry(env);
  let project: RegisteredProject;
  try {
    project = findProject(registry, ref);
    link(registry, project, root);
  } finally {
    registry.close();
  }
  return openFound({ root, dataDir: project.dataDir, storage: project.storage });
}

// Creates the project at the repo root (or the folder itself outside git), in common storage unless
// `local` keeps it in .otea/ there, or links the root to an existing project with `join`. Inside a
// folder that a project above already covers, it refuses unless `here` asks for a separate project.
export function initProject(
  cwd: string,
  options: InitOptions = {},
  env: Env = process.env,
): Project {
  const location = locate(cwd);
  const { root } = location;
  if (options.join !== undefined) return joinProject(location, options.join, env);
  const existing = nearest(root, root, env);
  if (existing && samePath(existing.root, root)) return openFound(existing);
  if (existing && !options.here) {
    throw new OteaError(
      'already_exists',
      `The Otea project at ${existing.root} already covers ${root}; run init --here to create a separate project at ${root}`,
    );
  }
  return options.local ? createLocal(location) : createCommon(location, env);
}

// The project as clients see it: its identity and the icon it was given, null when none was (the
// UI then draws a monogram of its name).
export type ProjectView = ProjectIdentity & { icon: string | null };

export function projectView(project: Project): ProjectView {
  return { ...project.identity, icon: selectProjectIcon(project.db) };
}

export function setProjectIcon(project: Project, icon: string | null): ProjectView {
  updateProjectIcon(project.db, icon === null ? null : assertIconName(icon));
  return projectView(project);
}
