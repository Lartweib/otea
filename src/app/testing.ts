import { join } from 'node:path';
import type { BoardDefinition } from '../core/board/model.ts';
import { type Preset, parsePreset } from '../core/preset.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import { createBoard, publishBoard, saveDraft } from './boards.ts';
import type { Context } from './context.ts';
import { type LoadedPreset, loadPresets, type PresetCatalog } from './presets.ts';
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
  const extra = presets.map((preset): [string, LoadedPreset] => [
    preset.name,
    { ...preset, origin: 'project' },
  ]);
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

// Publishes a definition as a board with the given id (a split names its boards by id), so a test
// can stand up several joined boards at once.
export function publishAs(
  ctx: Context,
  def: BoardDefinition,
  id: string,
  now: () => string = () => new Date().toISOString(),
): BoardDefinition {
  let n = 0;
  const ids = (kind: string) => (kind === 'b' ? id : `${kind}${id}${++n}`);
  const record = createBoard(ctx, { name: def.name, lang: 'es' }, now, ids);
  saveDraft(ctx, record.id, { definition: def, baseVersion: null }, now);
  publishBoard(ctx, record.id, { moves: {}, by: { kind: 'human', name: 'fede' } }, now);
  return def;
}
