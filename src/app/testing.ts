import { join } from 'node:path';
import { type Preset, parsePreset } from '../core/preset.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import type { Context } from './context.ts';
import { loadPresets, type PresetCatalog } from './presets.ts';
import type { Project } from './project.ts';

export const REVIEWS = parsePreset(`
preset: reviews
preset_version: 3
fields:
  title: { module: text, required: create }
workflow:
  initial: open
  states: { open: { turn: human }, closed: { turn: none, closes: discarded } }
  transitions: [{ from: open, to: closed, by: agent }]
`);

export function catalogWith(...presets: Preset[]): PresetCatalog {
  const official = loadPresets();
  const extra = presets.map((preset) => [preset.name, { ...preset, origin: 'project' }] as const);
  return {
    presets: new Map([...official.presets, ...extra]),
    problems: official.problems,
    warnings: official.warnings,
  };
}

export const IDENTITY = { id: 'memory-aaaaaa', name: 'memory' };

// A local project at `root` over the given context, without touching the disk.
export function projectOf(root: string, context: Context): Project {
  return { root, dataDir: join(root, '.otea'), storage: 'local', identity: IDENTITY, ...context };
}

export function memoryContext(...presets: Preset[]): Context {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, presets: catalogWith(...presets) };
}
