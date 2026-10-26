import type { DatabaseSync } from 'node:sqlite';
import type { PresetCatalog } from './presets.ts';

export type Context = { db: DatabaseSync; presets: PresetCatalog };
