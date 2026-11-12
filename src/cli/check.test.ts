import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveItem } from '../app/items.ts';
import { openProject } from '../app/project.ts';
import { type Cli, cliAt, tempGitRepo } from './testing.ts';

describe('check', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  let name: string;
  let task: string;

  const json = async (...argv: string[]) => JSON.parse((await otea(...argv, '--json')).out);
  // The person's own moves: approving the proposal, then the work.
  const person = (id: string, to: string) => {
    const project = openProject(repo.dir);
    try {
      moveItem(project, {
        id,
        to,
        actor: { kind: 'human', name: 'ana' },
        channel: 'ui',
      });
    } finally {
      project.db.close();
    }
  };

  beforeEach(async () => {
    repo = tempGitRepo();
    execFileSync('git', ['checkout', '--quiet', '-b', 'chg-1/keys'], { cwd: repo.dir });
    name = basename(repo.dir);
    otea = cliAt(repo.dir, { OTEA_AGENT: 'claude' });
    await otea('init');
    await otea('collection', 'add', 'changes', '--preset', 'change');
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
        `repo=${name}`,
        '--field',
        'branch=chg-1/keys',
      )
    ).id;
  });

  afterEach(() => repo.remove());

  it('refuses a push before the proposal is approved, in the board’s words', async () => {
    expect(await otea('check', '--gate', 'push', '--branch', '--repo')).toEqual({
      code: 1,
      out: `push refused: ${task} is in Propuesta; its branch can be pushed only while Implementar is being done.\n`,
      err: '',
    });
  });

  it('allows a push while implementing and refuses it in review; merges only once Done', async () => {
    person(task, 'implementing');

    expect(await otea('check', '--gate', 'push', '--branch', '--repo')).toMatchObject({
      code: 0,
      out: `push allowed: ${task} is being done in Implementar.\n`,
    });
    expect((await otea('check', '--gate', 'merge', '--branch', '--repo')).code).toBe(1);
    await otea('move', task, 'implementing__review');
    expect((await otea('check', '--gate', 'push', '--branch', '--repo')).code).toBe(1);
    person(task, 'done');

    expect((await otea('check', '--gate', 'merge', '--branch', '--repo')).code).toBe(0);
    expect((await otea('check', '--gate', 'push', '--branch', '--repo')).code).toBe(1);
  });

  it('takes the branch and the repo by name, and other fields with --field', async () => {
    const named = ['--branch', 'chg-1/keys', '--repo', name, '--json'];

    expect(await json('check', '--gate', 'push', ...named.slice(0, -1))).toEqual({
      gate: 'push',
      allowed: false,
      items: [
        expect.objectContaining({
          id: task,
          allowed: false,
          text: `push refused: ${task} is in Propuesta; its branch can be pushed only while Implementar is being done.`,
        }),
      ],
    });
    expect(
      (await otea('check', '--gate', 'push', '--field', `repo=${name}`, '--field', 'pr=#1')).code,
    ).toBe(0);
  });

  it('allows the action, with a note on stderr, when nothing matches or nothing gates it', async () => {
    for (const argv of [
      ['--gate', 'push', '--branch', 'other'],
      ['--gate', 'publish', '--branch', '--repo'],
    ]) {
      const result = await otea('check', ...argv);
      expect(result).toMatchObject({ code: 0, out: '' });
      expect(result.err).toContain('no item with a');
    }
    expect(await json('check', '--gate', 'push', '--branch', 'other')).toMatchObject({
      allowed: true,
      items: [],
    });
  });

  it('fails open outside a project, and when there is no branch to default to', async () => {
    const elsewhere = tempGitRepo();
    try {
      const outside = await cliAt(elsewhere.dir)('check', '--gate', 'push', '--branch', 'x');
      expect(outside).toMatchObject({ code: 0, out: '' });
      expect(outside.err).toContain('could not check');
    } finally {
      elsewhere.remove();
    }
    const plain = join(repo.dir, '..', `${name}-plain`);
    mkdirSync(plain);
    const noGit = await cliAt(plain)('check', '--gate', 'push', '--branch');
    expect(noGit).toMatchObject({ code: 0 });
    expect(noGit.err).toContain('could not check');
  });

  it('still refuses a field given twice as a usage error', async () => {
    const result = await otea('check', '--gate', 'push', '--branch', '--field', 'branch=x');

    expect(result.code).toBe(2);
    expect(result.err).toContain('Field "branch" given twice');
  });
});
