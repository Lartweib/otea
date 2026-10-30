import type { Layout } from '../core/modules.ts';
import type { CollectionLayout, FieldSpec, ItemType } from '../core/preset.ts';
import type { State } from '../core/workflow.ts';
import { listCollections } from '../store/queries.ts';
import type { Context } from './context.ts';
import type { PresetOrigin } from './presets.ts';

export type FieldView = FieldSpec & { name: string };

// A type as clients see it: its fields in order, where its items start, its states (whose turn
// each is and how the closed ones close), and its layout.
export type TypeView = {
  name: string;
  label: string;
  initial: string;
  incomplete?: string;
  states: State[];
  fields: FieldView[];
  layout: Layout;
};

// `fields` are the fields of every type, each once, in the order the types declare them.
export type PresetView = {
  name: string;
  version: number;
  origin: PresetOrigin;
  fields: FieldView[];
  types: TypeView[];
  view: CollectionLayout;
  collections: string[];
};

export function fieldViews(fields: Record<string, FieldSpec>): FieldView[] {
  return Object.entries(fields).map(([name, spec]) => ({ name, ...spec }));
}

export function typeViews(types: readonly ItemType[]): TypeView[] {
  return types.map(({ name, label, fields, workflow, layout }) => {
    const view: TypeView = {
      name,
      label,
      initial: workflow.initial,
      states: workflow.states,
      fields: fieldViews(fields),
      layout,
    };
    if (workflow.incomplete !== undefined) view.incomplete = workflow.incomplete;
    return view;
  });
}

function allFields(types: readonly ItemType[]): FieldView[] {
  const fields = Object.fromEntries(types.flatMap((type) => Object.entries(type.fields)).reverse());
  const order = [...new Set(types.flatMap((type) => Object.keys(type.fields)))];
  return order.map((name) => ({ name, ...(fields[name] as FieldSpec) }));
}

// Every loaded preset (official, then project) and the collections governed by it.
export function listPresetViews(ctx: Context): PresetView[] {
  const collections = listCollections(ctx.db);
  return [...ctx.presets.presets.values()].map(({ name, version, origin, types, view }) => ({
    name,
    version,
    origin,
    fields: allFields(types),
    types: typeViews(types),
    view,
    collections: collections.filter(({ preset }) => preset === name).map(({ name }) => name),
  }));
}
