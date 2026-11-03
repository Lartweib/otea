import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { prefixFor } from '../core/item.ts';
import { type CollectionLayout, DEFAULT_TYPE, type ItemType, typeOf } from '../core/preset.ts';
import { transaction } from '../store/database.ts';
import {
  type CollectionRecord,
  collectionTaken,
  findCollection,
  hasItemsOfType,
  insertCollection,
  listCollections,
  renameItemType,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type TypeView, typeViews } from './preset-views.ts';
import { type LoadedPreset, requirePreset } from './presets.ts';

export type Collection = CollectionRecord;

export const DEFAULT_PRESET = 'tasks';

export type AddCollectionInput = { name: string; preset?: string };

export function addCollection({ db, presets }: Context, input: AddCollectionInput): Collection {
  const preset = requirePreset(presets, input.preset ?? DEFAULT_PRESET);
  const collection = {
    name: input.name,
    prefix: prefixFor(input.name),
    preset: preset.name,
    presetVersion: preset.version,
    nextSeq: 1,
  };
  return transaction(db, () => {
    if (collectionTaken(db, collection.name, collection.prefix)) {
      throw new OteaError(
        'already_exists',
        `Name "${collection.name}" or prefix "${collection.prefix}" already in use`,
      );
    }
    insertCollection(db, collection);
    return collection;
  });
}

export function getCollection(db: DatabaseSync, name: string): Collection {
  const collection = findCollection(db, name);
  if (!collection) throw new OteaError('not_found', `Collection "${name}" not found`);
  return collection;
}

export function presetOf(ctx: Context, collection: Collection): LoadedPreset {
  return requirePreset(ctx.presets, collection.preset);
}

// The type an item is of, in its collection's preset.
export function typeOfItem(ctx: Context, item: { collection: string; type: string }): ItemType {
  return typeOf(presetOf(ctx, getCollection(ctx.db, item.collection)), item.type);
}

// Items stored while their preset declared no types are of the implicit type; once the preset names
// its only type, they take that name. Reading first keeps every later open from taking the write
// lock. Returns how many items it renamed.
export function nameImplicitTypes(ctx: Context): number {
  const renames = listCollections(ctx.db).flatMap(({ name, preset }) => {
    const types = ctx.presets.presets.get(preset)?.types ?? [];
    const [only] = types;
    if (types.length !== 1 || !only || only.name === DEFAULT_TYPE) return [];
    return hasItemsOfType(ctx.db, name, DEFAULT_TYPE) ? [{ name, type: only.name }] : [];
  });
  if (renames.length === 0) return 0;
  return transaction(ctx.db, () =>
    renames.reduce(
      (total, { name, type }) => total + renameItemType(ctx.db, name, DEFAULT_TYPE, type),
      0,
    ),
  );
}

export type CollectionView = {
  name: string;
  prefix: string;
  preset: string;
  types: TypeView[];
  view: CollectionLayout;
};

export function listCollectionViews(ctx: Context): CollectionView[] {
  return listCollections(ctx.db).map((collection) => {
    const { types, view } = presetOf(ctx, collection);
    return {
      name: collection.name,
      prefix: collection.prefix,
      preset: collection.preset,
      types: typeViews(types),
      view,
    };
  });
}
