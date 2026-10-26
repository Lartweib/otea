import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OteaError } from '../core/errors.ts';
import { type Preset, readPreset } from '../core/preset.ts';

export const OFFICIAL_PRESETS_DIR = fileURLToPath(new URL('../../presets/', import.meta.url));

export type PresetOrigin = 'official' | 'project';

export type LoadedPreset = Preset & { origin: PresetOrigin };

export type PresetProblem = { preset: string; origin: PresetOrigin; path: string; message: string };

export type PresetCatalog = {
  presets: ReadonlyMap<string, LoadedPreset>;
  problems: readonly PresetProblem[];
};

type Loaded = { preset?: LoadedPreset; problems: PresetProblem[] };

function projectPresetsDir(root: string): string {
  return join(root, '.otea', 'presets');
}

function subdirectories(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
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
  if (preset.playbook !== undefined && !existsSync(resolve(dir, name, preset.playbook))) {
    problems.push(problem(`playbook: ${preset.playbook} does not exist`));
  }
  return problems.length > 0 ? { problems } : { preset: { ...preset, origin }, problems };
}

export function loadPresets(
  projectRoot?: string,
  officialDir = OFFICIAL_PRESETS_DIR,
): PresetCatalog {
  const presets = new Map<string, LoadedPreset>();
  const problems: PresetProblem[] = [];
  const add = ({ preset, problems: found }: Loaded) => {
    if (preset) presets.set(preset.name, preset);
    problems.push(...found);
  };
  for (const name of subdirectories(officialDir)) add(loadOne(officialDir, name, 'official'));
  if (projectRoot === undefined) return { presets, problems };
  const projectDir = projectPresetsDir(projectRoot);
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
  return { presets, problems };
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
