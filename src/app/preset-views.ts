import type { CollectionLayout, FieldSpec, ItemType } from '../core/preset.ts';
import { type FieldView, type TypeView, typeViews } from '../core/views.ts';
import { listCollections } from '../store/queries.ts';
import type { Context } from './context.ts';
import type { PresetOrigin } from './presets.ts';

// Types and fields as clients see them are built in the core, so Studio's preview builds them from
// a draft with the same code.
export { type FieldView, fieldViews, type TypeView, typeViews } from '../core/views.ts';

// `fields` are the fields of every type, each once, in the order the types declare them.
export type PresetView = {
  name: string;
  version: number;
  origin: PresetOrigin;
  // The default icon of its collections; null when it has none.
  icon: string | null;
  fields: FieldView[];
  types: TypeView[];
  view: CollectionLayout;
  collections: string[];
  // Its own name in the languages it speaks, when it gives one.
  names?: Record<string, string>;
};

function allFields(types: readonly ItemType[]): FieldView[] {
  const fields = Object.fromEntries(types.flatMap((type) => Object.entries(type.fields)).reverse());
  const order = [...new Set(types.flatMap((type) => Object.keys(type.fields)))];
  return order.map((name) => ({ name, ...(fields[name] as FieldSpec) }));
}

// Every loaded preset (official, then project) and the collections governed by it.
export function listPresetViews(ctx: Context): PresetView[] {
  const collections = listCollections(ctx.db);
  return [...ctx.presets.presets.values()].map(
    ({ name, version, origin, icon, types, view, names }) => ({
      name,
      version,
      origin,
      icon: icon ?? null,
      fields: allFields(types),
      types: typeViews(types),
      view,
      collections: collections.filter(({ preset }) => preset === name).map(({ name }) => name),
      ...(names ? { names } : {}),
    }),
  );
}
