import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { parse, parseDocument } from 'yaml';
import {
  type Board,
  blueprintWarnings,
  connectionText,
  type SourceOrigin,
} from '../core/blueprint.ts';
import { OteaError } from '../core/errors.ts';
import { evidenceTypeOf } from '../core/evidence.ts';
import { type PresetNote, readPreset } from '../core/preset.ts';
import {
  readSamples,
  SAMPLE_FILE,
  SAMPLES_DIR,
  SAMPLES_FILE,
  type Sample,
} from '../core/samples.ts';
import { listCollections, selectItems } from '../store/queries.ts';
import {
  type BlueprintStatus,
  blueprintStatus,
  coordinationPlaybook,
  loadBlueprints,
  pointBoardAt,
  readProjectBlueprint,
  workflowsIn,
} from './blueprints.ts';
import {
  loadPresets,
  OFFICIAL_PRESETS_DIR,
  type PresetOrigin,
  projectPresetsDir,
  sampleFiles,
  samplesText,
} from './presets.ts';
import type { Project } from './project.ts';

// What Studio reads and writes: a preset's files as they are on disk, so an edit keeps the comments
// and the layout of the YAML. Official presets are read here and never written; a project preset is
// written only after the core reads the result as a valid preset.

const FILE = 'preset.yaml';
const NAME = /^[a-z0-9][a-z0-9-]*$/;

export type PresetUse = { name: string; items: number };

// A note on a preset as Studio shows it: the core's, with the file of the preset it is in.
export type StudioNote = PresetNote & { file: string };

// A preset's playbooks are keyed by the path the preset gives them (./playbook.md). `warnings` are
// the messages of its warning-level notes; `notes` are all of them, info ones too, with their paths.
export type PresetSource = {
  name: string;
  origin: PresetOrigin;
  editable: boolean;
  version: number | null;
  yaml: string;
  playbooks: Record<string, string>;
  collections: PresetUse[];
  problems: string[];
  warnings: string[];
  notes: StudioNote[];
};

export type PresetSummary = {
  name: string;
  origin: PresetOrigin;
  version: number | null;
  collections: string[];
  problems: string[];
};

// `samples` is the text of samples.yaml, written with the preset when given.
export type PresetDraft = { yaml: string; playbooks?: Record<string, string>; samples?: string };

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

type Located = { name: string; origin: PresetOrigin; dir: string };

// Official names win: a project preset that reuses one never loads, so it is not found either.
function locate(project: Project, name: string): Located {
  if (subdirectories(OFFICIAL_PRESETS_DIR).includes(name)) {
    return { name, origin: 'official', dir: join(OFFICIAL_PRESETS_DIR, name) };
  }
  const own = projectPresetsDir(project.dataDir);
  if (NAME.test(name) && existsSync(join(own, name, FILE))) {
    return { name, origin: 'project', dir: join(own, name) };
  }
  throw new OteaError('not_found', `Preset "${name}" not found`);
}

function inside(dir: string, path: string): string | undefined {
  const at = resolve(dir, path);
  const rel = relative(dir, at);
  return rel === '' || rel.startsWith('..') || isAbsolute(rel) ? undefined : at;
}

// The playbooks a preset's YAML points to, read loosely so an invalid preset still lists them.
function playbookPaths(yaml: string): string[] {
  let raw: unknown;
  try {
    raw = parse(yaml);
  } catch {
    return [];
  }
  if (typeof raw !== 'object' || raw === null) return [];
  const doc = raw as { playbook?: unknown; types?: unknown };
  const paths = [doc.playbook];
  if (typeof doc.types === 'object' && doc.types !== null) {
    for (const type of Object.values(doc.types as Record<string, unknown>)) {
      if (typeof type === 'object' && type !== null) {
        paths.push((type as { playbook?: unknown }).playbook);
      }
    }
  }
  return [...new Set(paths.filter((path): path is string => typeof path === 'string'))];
}

function readPlaybooks(dir: string, yaml: string): Record<string, string> {
  const playbooks: Record<string, string> = {};
  for (const path of playbookPaths(yaml)) {
    const at = inside(dir, path);
    if (at !== undefined && existsSync(at)) playbooks[path] = readFileSync(at, 'utf8');
  }
  return playbooks;
}

function uses(project: Project, name: string): PresetUse[] {
  return listCollections(project.db)
    .filter(({ preset }) => preset === name)
    .map((collection) => ({
      name: collection.name,
      items: selectItems(project.db, { collection: collection.name }).length,
    }));
}

function sourceOf(project: Project, { name, origin, dir }: Located): PresetSource {
  const yaml = readFileSync(join(dir, FILE), 'utf8');
  const loaded = project.presets.presets.get(name);
  const problems = project.presets.problems
    .filter((problem) => problem.preset === name && problem.origin === origin)
    .map(({ message }) => message);
  const notes = project.presets.warnings
    .filter((warning) => warning.preset === name && warning.origin === origin)
    .flatMap(({ code, level = 'warning', message, at, path }): StudioNote[] =>
      code === undefined || at === undefined
        ? []
        : [{ code, level, message, path: at, file: basename(path) }],
    );
  const warnings = notes.filter(({ level }) => level === 'warning').map(({ message }) => message);
  return {
    name,
    origin,
    editable: origin === 'project',
    version: loaded?.origin === origin ? loaded.version : null,
    yaml,
    playbooks: readPlaybooks(dir, yaml),
    collections: uses(project, name),
    problems,
    warnings,
    notes,
  };
}

// Every preset Studio can open: the loaded ones, then those whose problems keep them from loading.
export function listStudioPresets(project: Project): PresetSummary[] {
  const collections = listCollections(project.db);
  const usedBy = (name: string) =>
    collections.filter(({ preset }) => preset === name).map(({ name }) => name);
  const loaded = [...project.presets.presets.values()].map(({ name, origin, version }) => ({
    name,
    origin,
    version,
    collections: usedBy(name),
    problems: [],
  }));
  const broken = new Map<string, PresetSummary>();
  for (const { preset, origin, message } of project.presets.problems) {
    if (project.presets.presets.get(preset)?.origin === origin) continue;
    const summary = broken.get(preset) ?? {
      name: preset,
      origin,
      version: null,
      collections: usedBy(preset),
      problems: [],
    };
    summary.problems.push(message);
    broken.set(preset, summary);
  }
  return [...loaded, ...broken.values()];
}

export function readPresetSource(project: Project, name: string): PresetSource {
  return sourceOf(project, locate(project, name));
}

// A preset's samples as Studio draws them: samples.yaml as written, the files of its samples
// folder, and the samples read against the preset as it loaded, with what does not fit.
export type PresetSamples = {
  yaml: string | null;
  files: string[];
  samples: Sample[];
  notes: PresetNote[];
};

export function readPresetSamples(project: Project, name: string): PresetSamples {
  const { origin, dir } = locate(project, name);
  const yaml = samplesText(dir);
  const files = sampleFiles(dir);
  const loaded = project.presets.presets.get(name);
  const reading =
    loaded?.origin === origin ? readSamples(yaml, loaded, files) : { samples: [], notes: [] };
  return { yaml: yaml ?? null, files, ...reading };
}

// A file of a preset's samples folder: where it is and what it holds. Only a plain file name in
// that folder is ever served.
export function sampleAsset(
  project: Project,
  name: string,
  file: string,
): { path: string; contentType: string } {
  const { dir } = locate(project, name);
  if (!SAMPLE_FILE.test(file) || !sampleFiles(dir).includes(file)) {
    throw new OteaError('not_found', `Preset "${name}" has no sample file "${file}"`);
  }
  return { path: join(dir, SAMPLES_DIR, file), contentType: evidenceTypeOf(file).contentType };
}

function invalidDraft(name: string, problems: readonly string[]): OteaError {
  return new OteaError('invalid_draft', `Preset "${name}" is invalid: ${problems.join('; ')}`);
}

function storedVersion(yaml: string): number {
  try {
    const version = (parse(yaml) as { preset_version?: unknown } | null)?.preset_version;
    return typeof version === 'number' && Number.isInteger(version) && version > 0 ? version : 0;
  } catch {
    return 0;
  }
}

function withVersion(yaml: string, version: number): string {
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) return yaml;
  doc.set('preset_version', version);
  return doc.toString();
}

function writeProjectPreset(dir: string, yaml: string, playbooks: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [path, text] of Object.entries(playbooks)) {
    const at = inside(dir, path) as string;
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, text);
  }
  writeFileSync(join(dir, FILE), yaml);
}

// The problems of a draft: the core's, its name, and its playbooks, which must stay in its folder and
// exist once the draft is written.
function draftProblems(name: string, dir: string, yaml: string, playbooks: Record<string, string>) {
  const reading = readPreset(yaml);
  if (!reading.ok) return reading.problems;
  const problems: string[] = [];
  const { preset } = reading;
  if (preset.name !== name) {
    problems.push(`preset: "${preset.name}" does not match its directory "${name}"`);
  }
  const referenced = playbookPaths(yaml);
  for (const path of Object.keys(playbooks)) {
    if (!referenced.includes(path)) problems.push(`playbook ${path}: the preset does not use it`);
  }
  const check = (at: string, path: string | undefined) => {
    if (path === undefined) return;
    const file = inside(dir, path);
    if (file === undefined) problems.push(`${at}: ${path} is outside the preset's folder`);
    else if (!(path in playbooks) && !existsSync(file))
      problems.push(`${at}: ${path} does not exist`);
  };
  check('playbook', preset.playbook);
  for (const type of preset.types) check(`types.${type.name}.playbook`, type.playbook);
  return problems;
}

function reload(project: Project): void {
  project.presets = loadPresets(project.dataDir);
}

// Writes a project preset's draft once the core reads it as valid. Any change raises its
// preset_version by one, so items written under the old one are reported by otea validate.
export function savePreset(project: Project, name: string, draft: PresetDraft): PresetSource {
  const located = locate(project, name);
  if (located.origin === 'official') {
    throw new OteaError(
      'forbidden',
      `Preset "${name}" is official and read-only; duplicate it into the project to edit it`,
    );
  }
  const playbooks = draft.playbooks ?? {};
  const current = readFileSync(join(located.dir, FILE), 'utf8');
  const stored = storedVersion(current);
  const same = withVersion(draft.yaml, stored);
  const problems = draftProblems(name, located.dir, same, playbooks);
  if (problems.length > 0) throw invalidDraft(name, problems);
  const before = readPlaybooks(located.dir, current);
  const changed =
    same !== current || Object.entries(playbooks).some(([path, text]) => before[path] !== text);
  // Samples never reach an item, so changing them alone leaves the version as it is.
  const samples = draft.samples !== undefined && draft.samples !== samplesText(located.dir);
  if (samples) writeFileSync(join(located.dir, SAMPLES_FILE), draft.samples as string);
  if (changed) writeProjectPreset(located.dir, withVersion(same, stored + 1), playbooks);
  if (changed || samples) reload(project);
  return sourceOf(project, located);
}

// A blueprint as Studio lists it: its connections as `otea link` reads them, its playbook's text.
export type BlueprintSummary = {
  name: string;
  version: number;
  origin: SourceOrigin;
  boards: Board[];
  connections: string[];
  playbook: string | null;
  // What otea validate would warn about it once applied: a blocks link that waits for nothing.
  warnings: string[];
};

export type BlueprintListing = {
  blueprints: BlueprintSummary[];
  problems: Array<{ blueprint: string; origin: SourceOrigin; message: string }>;
};

export function listStudioBlueprints(project: Project): BlueprintListing {
  const catalog = loadBlueprints(project.presets, project.dataDir);
  return {
    blueprints: [...catalog.blueprints.values()].map((blueprint) => ({
      name: blueprint.name,
      version: blueprint.version,
      origin: blueprint.origin,
      boards: blueprint.boards,
      connections: blueprint.connections.map(connectionText),
      playbook: blueprint.playbookText,
      warnings: blueprintWarnings(blueprint, workflowsIn(project.presets, blueprint)),
    })),
    problems: catalog.problems.map(({ blueprint, origin, message }) => ({
      blueprint,
      origin,
      message,
    })),
  };
}

// The project's copy, what its source changed since, and the boards' items: null without one.
export type ProjectBlueprintView = {
  name: string;
  version: number;
  boards: Array<Board & { items: number }>;
  connections: string[];
  playbook: string | null;
  status: BlueprintStatus | { error: string };
};

export type ProjectBlueprintState = { blueprint: ProjectBlueprintView | null; problems: string[] };

export function projectBlueprintState(project: Project): ProjectBlueprintState {
  const reading = readProjectBlueprint(project.dataDir);
  if (reading === undefined) return { blueprint: null, problems: [] };
  const copy = reading.blueprint;
  if (copy === undefined) return { blueprint: null, problems: reading.problems };
  let status: ProjectBlueprintView['status'];
  try {
    status = blueprintStatus(project);
  } catch (error) {
    if (!(error instanceof OteaError)) throw error;
    status = { error: error.message };
  }
  const playbook = coordinationPlaybook({ ...project, blueprint: copy })?.playbook ?? null;
  return {
    blueprint: {
      name: copy.name,
      version: copy.version,
      boards: copy.boards.map((board) => ({
        ...board,
        items: selectItems(project.db, { collection: board.name }).length,
      })),
      connections: copy.connections.map(connectionText),
      playbook,
      status,
    },
    problems: [],
  };
}

function copySamples(from: string, to: string): void {
  const yaml = samplesText(from);
  if (yaml !== undefined) writeFileSync(join(to, SAMPLES_FILE), yaml);
  if (sampleFiles(from).length > 0) {
    cpSync(join(from, SAMPLES_DIR), join(to, SAMPLES_DIR), { recursive: true });
  }
}

// A new project preset's name: free, and never an official one's.
function assertFreeName(project: Project, name: string): string {
  if (!NAME.test(name)) {
    throw new OteaError('invalid_name', `"${name}" must be lowercase letters, digits and dashes`);
  }
  const own = projectPresetsDir(project.dataDir);
  if (subdirectories(OFFICIAL_PRESETS_DIR).includes(name) || existsSync(join(own, name))) {
    throw new OteaError('already_exists', `A preset named "${name}" already exists`);
  }
  return join(own, name);
}

// What a blank preset starts as: a title, and a workflow where an agent works an item and a human
// approves it or sends it back. It loads with no notes.
function blankPreset(name: string): string {
  return `preset: ${name}
preset_version: 1
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states:
    open: { turn: agent }
    review: { turn: human }
    done: { turn: none, closes: done }
    discarded: { turn: none, closes: discarded }
  transitions:
    - { from: open, to: review, by: agent }
    - { from: review, to: done, by: human }
    - { from: review, to: open, by: human, reason: required }
    - { from: [open, review], to: discarded, by: human, reason: required }
`;
}

// Creates a blank project preset, for Studio to build on.
export function createPreset(project: Project, name: string): PresetSource {
  const dir = assertFreeName(project, name);
  writeProjectPreset(dir, blankPreset(name), {});
  reload(project);
  return sourceOf(project, { name, origin: 'project', dir });
}

// Deletes a project preset with its playbooks and samples, once no collection uses it. Official
// presets are read-only.
export function deletePreset(project: Project, name: string): { deleted: string } {
  const located = locate(project, name);
  if (located.origin === 'official') {
    throw new OteaError('forbidden', `Preset "${name}" is official and read-only`);
  }
  const used = uses(project, name).map((use) => use.name);
  if (used.length > 0) {
    throw new OteaError(
      'in_use',
      `Cannot delete preset "${name}": collection${used.length === 1 ? '' : 's'} ${used.join(', ')} use${used.length === 1 ? 's' : ''} it`,
    );
  }
  rmSync(located.dir, { recursive: true, force: true });
  reload(project);
  return { deleted: name };
}

// Copies a preset, official or the project's, into the project under a new name, at version 1, with
// its playbooks and its samples. The copy is the project's to edit.
export function duplicatePreset(project: Project, name: string, as: string): PresetSource {
  const from = locate(project, name);
  const to = assertFreeName(project, as);
  const text = readFileSync(join(from.dir, FILE), 'utf8');
  const doc = parseDocument(text);
  if (doc.errors.length > 0) throw invalidDraft(name, [`invalid YAML: ${doc.errors[0]?.message}`]);
  doc.set('preset', as);
  doc.set('preset_version', 1);
  writeProjectPreset(to, doc.toString(), readPlaybooks(from.dir, text));
  copySamples(from.dir, to);
  reload(project);
  return sourceOf(project, { name: as, origin: 'project', dir: to });
}

// A board's preset copied into the project under a new name, and the board pointed at the copy:
// what Studio does before it changes an official preset a board uses, which is only read where it
// is. The copy starts at version 1 with the same types and states, so the board's items stay.
export function copyBoardPreset(
  project: Project,
  board: string,
  as: string,
): { board: string; preset: PresetSource } {
  const from = readProjectBlueprint(project.dataDir)?.blueprint?.boards.find(
    ({ name }) => name === board,
  );
  if (from === undefined) {
    throw new OteaError('not_found', `The project blueprint has no board ${board}`);
  }
  const copy = duplicatePreset(project, from.preset, as);
  pointBoardAt(project, board, copy.name);
  return { board, preset: readPresetSource(project, copy.name) };
}
