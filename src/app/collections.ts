import type { DatabaseSync } from 'node:sqlite';
import { OteaError } from '../core/errors.ts';
import { prefixFor } from '../core/item.ts';
import { tasks, type Workflow } from '../core/workflow.ts';
import { transaction } from '../store/database.ts';
import {
  type CollectionRecord,
  collectionTaken,
  findCollection,
  insertCollection,
} from '../store/queries.ts';

export type Collection = CollectionRecord;

export type AddCollectionInput = { name: string; workflow?: Workflow };

export function addCollection(db: DatabaseSync, input: AddCollectionInput): Collection {
  const collection = {
    name: input.name,
    prefix: prefixFor(input.name),
    workflow: input.workflow ?? tasks,
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
