import type { DatabaseSync } from 'node:sqlite';
import type { Blueprint } from '../core/blueprint.ts';
import type { PresetCatalog } from './presets.ts';

// `blueprint` is the project's copy of the blueprint it was built from, when it has one: the links
// between its boards answer to it.
export type Context = {
  db: DatabaseSync;
  presets: PresetCatalog;
  blueprint?: Blueprint | undefined;
};
