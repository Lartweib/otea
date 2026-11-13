import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OteaError } from '../core/errors.ts';
import { type Preset, type PresetNote, type PresetPath, readPreset } from '../core/preset.ts';
import { readSamples, SAMPLES_DIR, SAMPLES_FILE } from '../core/samples.ts';

export const OFFICIAL_PRESETS_DIR = fileURLToPath(new URL('../../presets/', import.meta.url));

export type PresetOrigin = 'official' | 'project';

// `playbookText`: the text of the playbooks it points to (its own, then its types'), which becomes the
// board's words for agents when its collection is read as a board.
export type LoadedPreset = Preset & { origin: PresetOrigin; playbookText?: string };

// `path` is the file the problem is in. A note (a warning or an info note) also carries its code,
// level and `at`, its place in the preset.
export type PresetProblem = {
  preset: string;
  origin: PresetOrigin;
  path: string;
  message: string;
  code?: PresetNote['code'];
  level?: PresetNote['level'];
  at?: PresetPath;
};

// Problems keep a preset from loading; notes, such as a deprecated key, a field no slot places or a
// sample that does not fit, do not. `warnings` holds every note, info ones too.
export type PresetCatalog = {
  presets: ReadonlyMap<string, LoadedPreset>;
  problems: readonly PresetProblem[];
  warnings: readonly PresetProblem[];
};

type Loaded = { preset?: LoadedPreset; problems: PresetProblem[]; warnings?: PresetProblem[] };

export function projectPresetsDir(dataDir: string): string {
  return join(dataDir, 'presets');
}

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// The texts of the playbooks the preset points to, by path.
function playbookTexts(dir: string, preset: Preset): Record<string, string> {
  const paths = [preset.playbook, ...preset.types.map(({ playbook }) => playbook)];
  return Object.fromEntries(
    [...new Set(paths)]
      .filter((path): path is string => path !== undefined)
      .map((path) => [path, readFileSync(resolve(dir, path), 'utf8')]),
  );
}

// The files of a preset's samples folder.
export function sampleFiles(dir: string): string[] {
  const folder = join(dir, SAMPLES_DIR);
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

// A preset's samples.yaml, or undefined without one.
export function samplesText(dir: string): string | undefined {
  const path = join(dir, SAMPLES_FILE);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function notesOf(dir: string, preset: Preset, notes: PresetNote[]): Array<[string, PresetNote]> {
  const samples = readSamples(samplesText(dir), preset, sampleFiles(dir));
  return [
    ...notes.map(
      (note): [string, PresetNote] => [join(dir, 'preset.yaml'), note],
    ),
    ...samples.notes.map((note): [string, PresetNote] => [join(dir, SAMPLES_FILE), note]),
  ];
}

function loadOne(dir: string, name: string, origin: PresetOrigin): Loaded {
  const path = join(dir, name, 'preset.yaml');
  const problem = (message: string) => ({ preset: name, origin, path, message });
  if (!existsSync(path)) return { problems: [problem('missing preset.yaml')] };
  const reading = readPreset(readFileSync(path, 'utf8'));
  if (!reading.ok) return { problems: reading.problems.map(problem) };
  const { preset } = reading;
  const problems: PresetProblem[] = [];
  if (preset.name !== name) {
    problems.push(problem(`preset: "${preset.name}" does not match its directory "${name}"`));
  }
  const missing = (playbook: string | undefined) =>
    playbook !== undefined && !existsSync(resolve(dir, name, playbook));
  if (missing(preset.playbook)) {
    problems.push(problem(`playbook: ${preset.playbook} does not exist`));
  }
  for (const type of preset.types.filter(({ playbook }) => missing(playbook))) {
    problems.push(problem(`types.${type.name}.playbook: ${type.playbook} does not exist`));
  }
  if (problems.length > 0) return { problems };
  const warnings = notesOf(join(dir, name), preset, reading.notes).map(
    ([file, { code, level, message, path: at }]) => ({
      preset: name,
      origin,
      path: file,
      code,
      level,
      at,
      message,
    }),
  );
  const playbookText = Object.values(playbookTexts(join(dir, name), preset))
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .join('\n\n');
  return {
    preset: { ...preset, origin, ...(playbookText === '' ? {} : { playbookText }) },
    problems,
    warnings,
  };
}

export function loadPresets(dataDir?: string, officialDir = OFFICIAL_PRESETS_DIR): PresetCatalog {
  const presets = new Map<string, LoadedPreset>();
  const problems: PresetProblem[] = [];
  const warnings: PresetProblem[] = [];
  const add = ({ preset, problems: found, warnings: warned = [] }: Loaded) => {
    if (preset) presets.set(preset.name, preset);
    problems.push(...found);
    warnings.push(...warned);
  };
  for (const name of subdirectories(officialDir)) add(loadOne(officialDir, name, 'official'));
  if (dataDir === undefined) return { presets, problems, warnings };
  const projectDir = projectPresetsDir(dataDir);
  for (const name of subdirectories(projectDir)) {
    if (presets.has(name)) {
      problems.push({
        preset: name,
        origin: 'project',
        path: join(projectDir, name, 'preset.yaml'),
        message: `"${name}" is an official preset name; rename the project preset`,
      });
    } else {
      add(loadOne(projectDir, name, 'project'));
    }
  }
  return { presets, problems, warnings };
}

export function requirePreset(catalog: PresetCatalog, name: string): LoadedPreset {
  const preset = catalog.presets.get(name);
  if (preset) return preset;
  const problems = catalog.problems.filter((problem) => problem.preset === name);
  if (problems.length > 0) {
    const details = problems.map(({ message }) => message).join('; ');
    throw new OteaError('invalid_preset', `Preset "${name}" is invalid: ${details}`);
  }
  throw new OteaError('not_found', `Preset "${name}" not found`);
}
