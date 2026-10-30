import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { prefixFor } from '../core/item.ts';
import { type CollectionLayout, type ItemType, typeOf } from '../core/preset.ts';
import { transaction } from '../store/database.ts';
import {
  type CollectionRecord,
  collectionTaken,
  findCollection,
  insertCollection,
  listCollections,
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
