import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { prefixFor } from '../core/item.ts';
import { transaction } from '../store/database.ts';
import {
  type CollectionRecord,
  collectionTaken,
  findCollection,
  insertCollection,
  listCollections,
} from '../store/queries.ts';
import type { Context } from './context.ts';
import { type FieldView, fieldViews } from './preset-views.ts';
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

export type CollectionView = {
  name: string;
  prefix: string;
  preset: string;
  initial: string;
  incomplete?: string;
  fields: FieldView[];
};

export function listCollectionViews(ctx: Context): CollectionView[] {
  return listCollections(ctx.db).map((collection) => {
    const { fields, workflow } = presetOf(ctx, collection);
    const view: CollectionView = {
      name: collection.name,
      prefix: collection.prefix,
      preset: collection.preset,
      initial: workflow.initial,
      fields: fieldViews(fields),
    };
    if (workflow.incomplete !== undefined) view.incomplete = workflow.incomplete;
    return view;
  });
}
