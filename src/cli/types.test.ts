import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, presetCollection, type TempRepo, tempGitRepo } from './testing.ts';

describe('item types', () => {
  let repo: TempRepo;
  let otea: Cli;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init', '--local');
    presetCollection(repo.dir, 'tasks');
  });

  afterEach(() => repo.remove());

  it('does not need --type on a board, whose items are all of one type', async () => {
    const task = await json('create', '--collection', 'tasks', '--title', 'Docs');

    expect(task.type).toBe('item');
  });
});
