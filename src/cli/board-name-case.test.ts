import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

// A board is named in any case wherever a command takes one, as its steps and fields are (list
// --state/--field) and as its name is unique whatever its case: `tareas` is Tareas.
describe('a board named in another case', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    await otea('create', '--collection', 'Tareas', '--title', 'Docs', '--description', 'D');
  });

  afterEach(() => repo.remove());

  it('creates an item on it', async () => {
    const created = await json(
      'create',
      '--collection',
      'tareas',
      '--title',
      'B',
      '--description',
      'D',
    );

    expect(created).toMatchObject({ id: 'TAR-2', collection: 'Tareas' });
  });

  it('lists, waits on and offers its items', async () => {
    expect(
      (await json('list', '--collection', 'TAREAS')).map(({ id }: { id: string }) => id),
    ).toEqual(['TAR-1']);
    expect((await json('list', '--collection', 'tareas', '--state', 'hacerlo')).length).toBe(1);
    expect(
      (await json('wait', '--turn', 'agent', '--collection', 'tareas', '--timeout', '1s')).id,
    ).toBe('TAR-1');
    expect((await json('next', '--collection', 'tareas')).item).toBe('TAR-1');
  });

  it('reads its events and its text for agents', async () => {
    expect((await json('events', '--collection', 'tareas')).itemId).toBe('TAR-1');
    const board = await otea('board', 'tareas');
    expect(board.code).toBe(0);
    expect(board.out).toContain('Tareas');
  });

  it('gives it an icon under its own name', async () => {
    const result = await otea('collection', 'icon', 'tareas', 'bug');

    expect(result.code).toBe(0);
    expect((await json('collection', 'icon', 'TAREAS', 'default')).name).toBe('Tareas');
  });

  it('still refuses a name no board has', async () => {
    expect((await otea('create', '--collection', 'tareass', '--title', 'X')).code).toBe(3);
  });
});
