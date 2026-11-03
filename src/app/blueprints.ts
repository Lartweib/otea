import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Blueprint,
  type BlueprintDiff,
  type Board,
  blueprintTypeProblems,
  blueprintYaml,
  type Connection,
  connectionText,
  describeDiff,
  diffBlueprints,
  readBlueprint,
  type SourceOrigin,
  type TypesOf,
} from '../core/blueprint.ts';
import { OteaError } from '../core/errors.ts';
import type { Finding } from '../core/validation.ts';
import { transaction } from '../store/database.ts';
import { deleteCollection, findCollection, selectItems } from '../store/queries.ts';
import { insertNewCollection } from './collections.ts';
import type { Context } from './context.ts';
import { type PresetCatalog, requirePreset } from './presets.ts';
import type { Project } from './project.ts';

export const OFFICIAL_BLUEPRINTS_DIR = fileURLToPath(new URL('../../blueprints/', import.meta.url));

const FILE = 'blueprint.yaml';

// The project's copy keeps the coordination playbook beside it, under this name.
const COPY_PLAYBOOK = 'blueprint.md';

const COPY_HEADER = [
  '# The blueprint this project was built from, copied by otea: otea blueprint status compares it',
  '# with its source, and otea blueprint update brings in what changed.',
  '',
].join('\n');

// A blueprint read from its source, with the hash of what was read (the YAML and its playbook).
export type LoadedBlueprint = Blueprint & {
  origin: SourceOrigin;
  path: string;
  hash: string;
  playbookText: string | null;
};

export type BlueprintProblem = {
  blueprint: string;
  origin: SourceOrigin;
  path: string;
  message: string;
};

export type BlueprintCatalog = {
  blueprints: ReadonlyMap<string, LoadedBlueprint>;
  problems: readonly BlueprintProblem[];
};

export function projectBlueprintsDir(dataDir: string): string {
  return join(dataDir, 'blueprints');
}

// The project's own copy of its blueprint, in its data folder.
export function projectBlueprintPath(dataDir: string): string {
  return join(dataDir, FILE);
}

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function typesIn(presets: PresetCatalog): TypesOf {
  return (name) => {
    try {
      return requirePreset(presets, name).types.map((type) => type.name);
    } catch (error) {
      if (error instanceof OteaError) return error.message;
      throw error;
    }
  };
}

function hashOf(text: string, playbook: string | null): string {
  const hash = createHash('sha256').update(text);
  if (playbook !== null) hash.update('\0').update(playbook);
  return hash.digest('hex');
}

type Loaded = { blueprint?: LoadedBlueprint; problems: string[] };

// A blueprint file and its playbook, checked against the presets its boards are built from.
function readSource(path: string, origin: SourceOrigin, presets: PresetCatalog): Loaded {
  if (!existsSync(path)) return { problems: [`missing ${FILE}`] };
  const text = readFileSync(path, 'utf8');
  const reading = readBlueprint(text);
  if (!reading.ok) return { problems: reading.problems };
  const { source: _copied, ...blueprint } = reading.blueprint;
  const problems = blueprintTypeProblems(blueprint, typesIn(presets));
  let playbookText: string | null = null;
  if (blueprint.playbook !== undefined) {
    const at = resolve(dirname(path), blueprint.playbook);
    if (existsSync(at)) playbookText = readFileSync(at, 'utf8');
    else problems.push(`playbook: ${blueprint.playbook} does not exist`);
  }
  if (problems.length > 0) return { problems };
  const hash = hashOf(text, playbookText);
  return { blueprint: { ...blueprint, origin, path, hash, playbookText }, problems };
}

function loadOne(dir: string, name: string, origin: SourceOrigin, presets: PresetCatalog) {
  const path = join(dir, name, FILE);
  const problem = (message: string): BlueprintProblem => ({
    blueprint: name,
    origin,
    path,
    message,
  });
  const loaded = readSource(path, origin, presets);
  if (loaded.blueprint && loaded.blueprint.name !== name) {
    const message = `blueprint: "${loaded.blueprint.name}" does not match its directory "${name}"`;
    return { problems: [problem(message)] };
  }
  return { blueprint: loaded.blueprint, problems: loaded.problems.map(problem) };
}

// Official blueprints live in blueprints/ beside presets/; a project adds its own in blueprints/ in
// its data folder, under names the official ones do not use.
export function loadBlueprints(
  presets: PresetCatalog,
  dataDir?: string,
  officialDir = OFFICIAL_BLUEPRINTS_DIR,
): BlueprintCatalog {
  const blueprints = new Map<string, LoadedBlueprint>();
  const problems: BlueprintProblem[] = [];
  const add = ({ blueprint, problems: found }: ReturnType<typeof loadOne>) => {
    if (blueprint) blueprints.set(blueprint.name, blueprint);
    problems.push(...found);
  };
  for (const name of subdirectories(officialDir))
    add(loadOne(officialDir, name, 'official', presets));
  if (dataDir === undefined) return { blueprints, problems };
  const projectDir = projectBlueprintsDir(dataDir);
  for (const name of subdirectories(projectDir)) {
    if (blueprints.has(name)) {
      problems.push({
        blueprint: name,
        origin: 'project',
        path: join(projectDir, name, FILE),
        message: `"${name}" is an official blueprint name; rename the project blueprint`,
      });
    } else {
      add(loadOne(projectDir, name, 'project', presets));
    }
  }
  return { blueprints, problems };
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

function invalid(what: string, problems: readonly string[]): OteaError {
  return new OteaError('invalid_blueprint', `${what} is invalid: ${problems.join('; ')}`);
}

// A blueprint by name (the project's own first, then the official ones), or else by path: a
// blueprint.yaml, or the folder holding one, relative to `cwd`.
export function findBlueprint(project: Project, ref: string, cwd: string): LoadedBlueprint {
  if (NAME.test(ref)) {
    const catalog = loadBlueprints(project.presets, project.dataDir);
    const found = catalog.blueprints.get(ref);
    if (found) return found;
    const problems = catalog.problems.filter(({ blueprint }) => blueprint === ref);
    if (problems.length > 0) {
      throw invalid(
        `Blueprint "${ref}"`,
        problems.map(({ message }) => message),
      );
    }
    const known = [...catalog.blueprints.keys()].join(', ') || 'none';
    throw new OteaError('not_found', `Blueprint "${ref}" not found (blueprints: ${known})`);
  }
  let path = resolve(cwd, ref);
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, FILE);
  if (!existsSync(path)) throw new OteaError('not_found', `No blueprint at ${path}`);
  const loaded = readSource(path, 'path', project.presets);
  if (!loaded.blueprint) throw invalid(`The blueprint at ${path}`, loaded.problems);
  return loaded.blueprint;
}

export type ProjectBlueprintReading = { blueprint?: Blueprint; problems: string[] };

// The project's copy, or undefined when the project has no blueprint.
export function readProjectBlueprint(dataDir: string): ProjectBlueprintReading | undefined {
  const path = projectBlueprintPath(dataDir);
  if (!existsSync(path)) return undefined;
  const reading = readBlueprint(readFileSync(path, 'utf8'));
  return reading.ok
    ? { blueprint: reading.blueprint, problems: [] }
    : { problems: reading.problems };
}

function requireCopy(project: Project): Blueprint {
  const reading = readProjectBlueprint(project.dataDir);
  if (reading === undefined) {
    throw new OteaError(
      'not_found',
      'This project has no blueprint; run otea blueprint apply <name|path>',
    );
  }
  if (reading.blueprint === undefined) {
    throw invalid(
      `The project blueprint ${projectBlueprintPath(project.dataDir)}`,
      reading.problems,
    );
  }
  return reading.blueprint;
}

function copyPlaybook(dataDir: string, copy: Blueprint): string | null {
  if (copy.playbook === undefined) return null;
  const path = resolve(dataDir, copy.playbook);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

// Writes the project's copy of `source`, with the boards and connections it keeps, and makes it the
// blueprint the project's links answer to from now on.
function writeCopy(
  ctx: Context & { dataDir: string },
  source: LoadedBlueprint,
  boards: Board[],
  connections: Connection[],
): Blueprint {
  const { origin, path, hash } = source;
  const copy: Blueprint = {
    name: source.name,
    version: source.version,
    boards,
    connections,
    source: { origin, hash, ...(origin === 'path' ? { path } : {}) },
  };
  const playbookPath = join(ctx.dataDir, COPY_PLAYBOOK);
  if (source.playbookText === null) {
    rmSync(playbookPath, { force: true });
  } else {
    writeFileSync(playbookPath, source.playbookText);
    copy.playbook = `./${COPY_PLAYBOOK}`;
  }
  writeFileSync(projectBlueprintPath(ctx.dataDir), `${COPY_HEADER}${blueprintYaml(copy)}`);
  ctx.blueprint = copy;
  return copy;
}

export type BoardAction = 'created' | 'kept';

export type AppliedBlueprint = {
  blueprint: { name: string; version: number; origin: SourceOrigin };
  boards: Array<Board & { action: BoardAction }>;
};

function conflict(name: string, existing: string, wanted: string): string {
  return `Collection "${name}" already exists with preset ${existing}; the blueprint builds it with ${wanted}`;
}

// Builds every board of a blueprint at once, reusing a collection of the same name and preset, and
// keeps a copy of the blueprint in the project. Nothing is created when any board cannot be.
export function applyBlueprint(project: Project, ref: string, cwd: string): AppliedBlueprint {
  const existing = readProjectBlueprint(project.dataDir);
  if (existing !== undefined) {
    const name = existing.blueprint ? ` (${existing.blueprint.name})` : '';
    throw new OteaError(
      'already_exists',
      `This project already has a blueprint${name}; run otea blueprint status, and otea blueprint update to bring in changes`,
    );
  }
  const source = findBlueprint(project, ref, cwd);
  const boards = transaction(project.db, () =>
    source.boards.map(({ name, preset }) => {
      const collection = findCollection(project.db, name);
      if (collection === undefined) {
        insertNewCollection(project, { name, preset });
        return { name, preset, action: 'created' as const };
      }
      if (collection.preset !== preset) {
        throw new OteaError('already_exists', conflict(name, collection.preset, preset));
      }
      return { name, preset, action: 'kept' as const };
    }),
  );
  writeCopy(project, source, source.boards, source.connections);
  const { name, version, origin } = source;
  return { blueprint: { name, version, origin }, boards };
}

type Comparison = {
  copy: Blueprint;
  source?: LoadedBlueprint;
  missing?: string;
  diff?: BlueprintDiff;
  playbookChanged: boolean;
  changes: string[];
};

function findSource(project: Project, copy: Blueprint): LoadedBlueprint | string {
  const source = copy.source;
  if (source === undefined) return 'the copy records no source';
  if (source.origin === 'path') {
    const path = source.path ?? '';
    if (!existsSync(path)) return `nothing at ${path}`;
    const loaded = readSource(path, 'path', project.presets);
    return loaded.blueprint ?? `the blueprint at ${path} is invalid: ${loaded.problems.join('; ')}`;
  }
  const catalog = loadBlueprints(project.presets, project.dataDir);
  const found = catalog.blueprints.get(copy.name);
  if (found && found.origin === source.origin) return found;
  const problems = catalog.problems.filter(({ blueprint }) => blueprint === copy.name);
  if (problems.length > 0) {
    return `the blueprint "${copy.name}" is invalid: ${problems.map(({ message }) => message).join('; ')}`;
  }
  return `the ${source.origin} blueprint "${copy.name}" no longer exists`;
}

function compare(project: Project): Comparison {
  const copy = requireCopy(project);
  const source = findSource(project, copy);
  if (typeof source === 'string') {
    return { copy, missing: source, playbookChanged: false, changes: [] };
  }
  const diff = diffBlueprints(copy, source);
  const playbookChanged = copyPlaybook(project.dataDir, copy) !== source.playbookText;
  const changes = [...describeDiff(diff), ...(playbookChanged ? ['~ playbook'] : [])];
  if (changes.length === 0 && copy.source?.hash !== source.hash) {
    changes.push('~ source text (no board, connection or playbook change)');
  }
  return { copy, source, diff, playbookChanged, changes };
}

export type BlueprintStatus = {
  name: string;
  version: number;
  origin: SourceOrigin | null;
  path?: string;
  upToDate: boolean;
  // Why the source cannot be compared, when it cannot.
  missing?: string;
  changes: string[];
};

export function blueprintStatus(project: Project): BlueprintStatus {
  const { copy, missing, changes } = compare(project);
  const status: BlueprintStatus = {
    name: copy.name,
    version: copy.version,
    origin: copy.source?.origin ?? null,
    upToDate: missing === undefined && changes.length === 0,
    changes,
  };
  if (copy.source?.path !== undefined) status.path = copy.source.path;
  if (missing !== undefined) status.missing = missing;
  return status;
}

export type BlueprintUpdate = {
  name: string;
  version: number;
  applied: string[];
  // What the source changed that the project keeps as it was: boards with items are never deleted.
  kept: string[];
};

const itemCount = (ctx: Context, board: string) =>
  selectItems(ctx.db, { collection: board }).length;

const items = (count: number) => `${count} item${count === 1 ? '' : 's'}`;

// Brings the source's changes into the project: adds boards and connections, rebuilds or removes
// a board only while it has no items, and reports each one it keeps.
export function updateBlueprint(project: Project): BlueprintUpdate {
  const { copy, source, missing, diff, playbookChanged } = compare(project);
  if (source === undefined || diff === undefined) {
    throw new OteaError('not_found', `Cannot update the blueprint "${copy.name}": ${missing}`);
  }
  const applied: string[] = [];
  const kept: string[] = [];
  const boards = new Map(source.boards.map(({ name, preset }) => [name, preset]));
  const { db } = project;
  transaction(db, () => {
    for (const { name, preset } of diff.boardsRemoved) {
      const count = itemCount(project, name);
      if (count > 0) {
        kept.push(
          `Kept board ${name}: it has ${items(count)}, and a board with items is never deleted`,
        );
        boards.set(name, preset);
        continue;
      }
      if (findCollection(db, name)) deleteCollection(db, name);
      applied.push(`Removed board ${name} (it had no items)`);
    }
    for (const { name, from, to } of diff.boardsChanged) {
      const count = itemCount(project, name);
      if (count > 0) {
        kept.push(`Kept board ${name} with preset ${from}: it has ${items(count)}`);
        boards.set(name, from);
        continue;
      }
      if (findCollection(db, name)) deleteCollection(db, name);
      insertNewCollection(project, { name, preset: to });
      applied.push(`Rebuilt board ${name} with preset ${to}`);
    }
    for (const { name, preset } of diff.boardsAdded) {
      const collection = findCollection(db, name);
      if (collection === undefined) {
        insertNewCollection(project, { name, preset });
        applied.push(`Created board ${name} (preset ${preset})`);
      } else if (collection.preset === preset) {
        applied.push(`Made collection ${name} a board`);
      } else {
        kept.push(`Did not add board ${name}: ${conflict(name, collection.preset, preset)}`);
        boards.delete(name);
      }
    }
  });
  const connections = source.connections.filter(
    ({ from, to }) => boards.has(from.board) && boards.has(to.board),
  );
  applied.push(
    ...diff.connectionsAdded
      .filter((connection) => connections.includes(connection))
      .map((connection) => `Allowed ${connectionText(connection)}`),
    ...diff.connectionsRemoved.map(
      (connection) => `No longer allowed ${connectionText(connection)}`,
    ),
    ...(playbookChanged ? ['Updated the coordination playbook'] : []),
  );
  const finalBoards = [...boards].map(([name, preset]) => ({ name, preset }));
  writeCopy(project, source, finalBoards, connections);
  return { name: source.name, version: source.version, applied, kept };
}

// The coordination playbook of the project's blueprint, when it has one.
export function coordinationPlaybook(
  project: Project,
): { name: string; playbook: string } | undefined {
  const copy = project.blueprint;
  if (copy === undefined) return undefined;
  const playbook = copyPlaybook(project.dataDir, copy);
  return playbook === null ? undefined : { name: copy.name, playbook };
}

// What otea validate says about blueprints: the problems of those the project could use, those of
// its own copy, and what its source changed since it was copied.
export function blueprintFindings(project: Project): Finding[] {
  const catalog = loadBlueprints(project.presets, project.dataDir);
  const findings: Finding[] = catalog.problems.map(({ blueprint, message }) => ({
    severity: 'error',
    subject: `blueprint ${blueprint}`,
    message,
  }));
  const reading = readProjectBlueprint(project.dataDir);
  if (reading === undefined) return findings;
  const { blueprint } = reading;
  if (blueprint === undefined) {
    const subject = 'project blueprint';
    return [
      ...findings,
      ...reading.problems.map((message) => ({ severity: 'error' as const, subject, message })),
    ];
  }
  const subject = `project blueprint ${blueprint.name}`;
  for (const message of blueprintTypeProblems(blueprint, typesIn(project.presets))) {
    findings.push({ severity: 'error', subject, message });
  }
  const { missing, changes } = compare(project);
  if (missing !== undefined) {
    findings.push({
      severity: 'warning',
      subject,
      message: `its source cannot be read: ${missing}`,
    });
  } else if (changes.length > 0) {
    findings.push({
      severity: 'warning',
      subject,
      message: `the source changed since it was copied (${changes.join('; ')}); run otea blueprint update`,
    });
  }
  return findings;
}
