import type { FieldSpec } from '../core/preset.ts';
import { listCollections } from '../store/queries.ts';
import type { Context } from './context.ts';
import type { PresetOrigin } from './presets.ts';

export type FieldView = FieldSpec & { name: string };

export type PresetView = {
  name: string;
  version: number;
  origin: PresetOrigin;
  fields: FieldView[];
  collections: string[];
};

export function fieldViews(fields: Record<string, FieldSpec>): FieldView[] {
  return Object.entries(fields).map(([name, spec]) => ({ name, ...spec }));
}

// Every loaded preset (official, then project) and the collections governed by it.
export function listPresetViews(ctx: Context): PresetView[] {
  const collections = listCollections(ctx.db);
  return [...ctx.presets.presets.values()].map(({ name, version, origin, fields }) => ({
    name,
    version,
    origin,
    fields: fieldViews(fields),
    collections: collections.filter(({ preset }) => preset === name).map(({ name }) => name),
  }));
}
