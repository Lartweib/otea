import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { addCollection } from '../app/collections.ts';
import { createItem } from '../app/items.ts';
import { initProject, openProject } from '../app/project.ts';
import type { Command } from './command.ts';

function withProject<T>(cwd: string, use: (db: DatabaseSync) => T): T {
  const { db } = openProject(cwd);
  try {
    return use(db);
  } finally {
    db.close();
  }
}

const init: Command = {
  name: 'init',
  summary: 'Create or reuse the .otea project at the repository root',
  args: [],
  options: {},
  execute: ({ cwd }) => {
    const { root, db } = initProject(cwd);
    db.close();
    const path = join(root, '.otea');
    return { data: { root, path }, text: path };
  },
};

const collectionAdd: Command = {
  name: 'collection add',
  summary: 'Add a collection that uses the built-in tasks workflow',
  args: ['name'],
  options: {},
  execute: ({ cwd, args: [name = ''] }) => {
    const collection = withProject(cwd, (db) => addCollection(db, { name }));
    return {
      data: collection,
      text: `Added collection "${collection.name}" (ids ${collection.prefix}-<n>)`,
    };
  },
};

const create: Command = {
  name: 'create',
  summary: 'Create an item in its collection initial state and print its id',
  args: [],
  options: { collection: { required: true }, title: { required: true }, body: {} },
  execute: ({ cwd, actor, option, required }) => {
    const collection = required('collection');
    const title = required('title');
    const body = option('body') ?? '';
    const item = withProject(cwd, (db) => createItem(db, { collection, title, body, actor }));
    return { data: item, text: item.id };
  },
};

export const COMMANDS: readonly Command[] = [init, collectionAdd, create];

export function findCommand(tokens: readonly string[]): Command | undefined {
  return COMMANDS.find((command) =>
    command.name.split(' ').every((word, index) => tokens[index] === word),
  );
}
