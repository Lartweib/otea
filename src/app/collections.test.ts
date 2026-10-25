import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Workflow } from '../core/workflow.ts';
import { tasks } from '../core/workflow.ts';
import { openDatabase } from '../store/database.ts';
import { migrate } from '../store/migrations.ts';
import { addCollection, getCollection } from './collections.ts';

const review: Workflow = {
  name: 'review',
  initial: 'open',
  states: [
    { name: 'open', turn: 'human' },
    { name: 'closed', turn: 'none' },
  ],
  transitions: { open: ['closed'] },
};

describe('collections', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
  });

  afterEach(() => db.close());

  it('adds a collection with the tasks workflow by default', () => {
    const collection = addCollection(db, { name: 'tasks' });

    expect(collection).toEqual({ name: 'tasks', prefix: 'TASKS', workflow: tasks, nextSeq: 1 });
    expect(getCollection(db, 'tasks')).toEqual(collection);
  });

  it('stores a custom workflow', () => {
    addCollection(db, { name: 'reviews', workflow: review });

    expect(getCollection(db, 'reviews').workflow).toEqual(review);
  });

  it('rejects a duplicate name with already_exists', () => {
    addCollection(db, { name: 'tasks' });

    expect(() => addCollection(db, { name: 'tasks' })).toThrow(
      expect.objectContaining({ code: 'already_exists' }),
    );
  });

  it('rejects a name whose prefix is taken with already_exists', () => {
    addCollection(db, { name: 'bug-reports' });

    expect(() => addCollection(db, { name: 'bugreports' })).toThrow(
      expect.objectContaining({ code: 'already_exists' }),
    );
  });

  it('rejects a name without a usable prefix with invalid_name', () => {
    expect(() => addCollection(db, { name: '!!' })).toThrow(
      expect.objectContaining({ code: 'invalid_name' }),
    );
  });

  it('fails with not_found for an unknown collection', () => {
    expect(() => getCollection(db, 'missing')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
  });
});
