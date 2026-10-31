import { type Preset, parsePreset } from '../core/preset.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import type { Context } from './context.ts';
import { loadPresets, type PresetCatalog } from './presets.ts';

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

export function memoryContext(...presets: Preset[]): Context {
  const db = openDatabase(':memory:');
  migrate(db);
  return { db, presets: catalogWith(...presets) };
}
