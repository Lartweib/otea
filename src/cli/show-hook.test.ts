import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, presetCollection, tempGitRepo } from './testing.ts';

// show says whether the repo a repo task names has Otea's pre-push hook, where it is checked out:
// without it, a push from there is never checked.
describe('show of a repo task', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let task: string;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);

  beforeEach(async () => {
    repo = tempGitRepo();
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/acme/keys.git'], {
      cwd: repo.dir,
    });
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    presetCollection(repo.dir, 'changes', 'change');
    await otea('create', '--collection', 'changes', '--title', 'Keys');
    task = (
      await json(
        'create',
        '--collection',
        'Tareas de repo',
        '--parent',
        'CHANGES-1',
        '--title',
        'Keys here',
        '--field',
        `repo=${basename(repo.dir)}`,
        '--field',
        'branch=chg-1/keys',
      )
    ).id;
  });

  afterEach(() => repo.remove());

  it('says the hook is not installed in the repo’s checkout, and how to install it', async () => {
    const { out } = await otea('show', task);

    expect(out).toContain(
      `Git hook: not installed in ${repo.dir}: run otea hook install --git there`,
    );
    expect((await json('show', task)).gitHook).toEqual({
      repo: basename(repo.dir),
      installed: [],
      missing: [repo.dir],
    });
  });

  it('says the hook is installed once it is', async () => {
    await otea('hook', 'install', '--git');

    expect((await otea('show', task)).out).toContain(`Git hook: installed in ${repo.dir}`);
    expect((await json('show', task)).gitHook).toEqual({
      repo: basename(repo.dir),
      installed: [repo.dir],
      missing: [],
    });
  });

  it('says when no checkout of the repo is known to the project', async () => {
    const { id } = await json(
      'create',
      '--collection',
      'Tareas de repo',
      '--parent',
      'CHANGES-1',
      '--title',
      'Keys there',
      '--field',
      'repo=elsewhere',
      '--field',
      'branch=chg-1/there',
    );

    expect((await otea('show', id)).out).toContain(
      'Git hook: no checkout of elsewhere is known to the project (otea repos add)',
    );
    expect((await json('show', id)).gitHook).toEqual({
      repo: 'elsewhere',
      installed: [],
      missing: [],
    });
  });

  it('says nothing of a hook for an item that names no repo', async () => {
    expect((await otea('show', 'CHANGES-1')).out).not.toContain('Git hook');
    expect(await json('show', 'CHANGES-1')).not.toHaveProperty('gitHook');
  });
});
