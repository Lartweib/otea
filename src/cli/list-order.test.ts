import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createItem } from '../app/items.ts';
import { dropItem } from '../app/next.ts';
import { pinItems, setOrder } from '../app/priority.ts';
import { openProject } from '../app/project.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

const you = { kind: 'human' as const, name: 'fede' };

// P1-R2-6, P1-R2-7: list says the order as the desk's «Tu orden» counts it (over open items), and
// sorts by it on request, so a power user does not sort in their head.
describe('list and the person order', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const ids = async (...argv: string[]) =>
    (JSON.parse((await otea('list', ...argv, '--json')).out) as Array<{ id: string }>).map(
      ({ id }) => id,
    );

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    await otea('board', 'add', 'Tareas', '--template', 'tasks');
    const project = openProject(repo.dir);
    try {
      for (const title of ['A', 'B', 'C', 'D', 'E'])
        createItem(project, { collection: 'Tareas', title, fields: {}, actor: you, channel: 'ui' });
      setOrder(project, { collection: 'Tareas', ids: ['TAR-1', 'TAR-4', 'TAR-2'], actor: you });
      pinItems(project, { ids: ['TAR-5', 'TAR-3'], pinned: true, actor: you });
      dropItem(project, { id: 'TAR-1', actor: you, channel: 'ui', reason: 'no' });
    } finally {
      project.db.close();
    }
  });

  afterEach(() => repo.remove());

  it('keeps creation order by default, and sorts by the order with --sort order', async () => {
    expect(await ids('--collection', 'Tareas')).toEqual([
      'TAR-1',
      'TAR-2',
      'TAR-3',
      'TAR-4',
      'TAR-5',
    ]);
    expect(await ids('--collection', 'Tareas', '--sort', 'order')).toEqual([
      'TAR-5',
      'TAR-3',
      'TAR-4',
      'TAR-2',
      'TAR-1',
    ]);
  });

  // P1-R3-11: a closed item (PED-1, Done) came ahead of the open items with no order, by creation.
  it('puts the open items with no order before the closed ones', async () => {
    const project = openProject(repo.dir);
    try {
      createItem(project, {
        collection: 'Tareas',
        title: 'F',
        fields: {},
        actor: you,
        channel: 'ui',
      });
      setOrder(project, { collection: 'Tareas', ids: ['TAR-4', 'TAR-2'], actor: you });
    } finally {
      project.db.close();
    }

    expect(await ids('--collection', 'Tareas', '--sort', 'order')).toEqual([
      'TAR-5',
      'TAR-3',
      'TAR-4',
      'TAR-2',
      'TAR-6',
      'TAR-1',
    ]);
  });

  it('numbers the order over open items, as the desk does', async () => {
    const text = (await otea('list', '--collection', 'Tareas', '--sort', 'order')).out;
    expect(text).toMatch(/TAR-5 .*on top 1/);
    expect(text).toMatch(/TAR-3 .*on top 2/);
    expect(text).toMatch(/TAR-4 .*order 1/);
    expect(text).toMatch(/TAR-2 .*order 2/);
    expect(text).not.toMatch(/TAR-1 .*order/);
  });

  it('refuses another sort', async () => {
    const result = await otea('list', '--sort', 'title');
    expect(result.code).not.toBe(0);
  });
});
