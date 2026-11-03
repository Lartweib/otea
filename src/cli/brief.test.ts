import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, type TempRepo, tempGitRepo } from './testing.ts';

describe('brief', () => {
  let repo: TempRepo;
  let otea: Cli;

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir);
    await otea('init');
    await otea('collection', 'add', 'tasks');
    await otea('create', '--collection', 'tasks', '--title', 'Ship it', '--description', 'D');
    await otea('create', '--collection', 'tasks', '--title', 'Write docs', '--description', 'D');
    await otea('link', 'TASKS-2', 'blocks', 'TASKS-1');
  });

  afterEach(() => repo.remove());

  it('prints a Markdown brief for every id given, in the order their blocks allow', async () => {
    const { code, out } = await otea(
      'brief',
      'TASKS-1',
      'TASKS-2',
      '--constraint',
      'Stay in docs/',
    );

    expect(code).toBe(0);
    expect(out).toContain(
      '## Order\n\n1. TASKS-2 · Write docs\n2. TASKS-1 · Ship it (after TASKS-2)',
    );
    expect(out).toContain('## Limits\n\n- Stay in docs/\n');
    expect(out).toContain('## Success');
  });

  it('prints the order and the Markdown under --json', async () => {
    const { out } = await otea('brief', 'TASKS-1', '--json');

    expect(JSON.parse(out)).toMatchObject({
      order: [{ id: 'TASKS-1', after: [], missing: ['TASKS-2'] }],
      markdown: expect.stringContaining('# Brief'),
    });
  });

  it('asks for at least one id', async () => {
    const { code, err } = await otea('brief');

    expect(code).toBe(2);
    expect(err).toContain('Usage: otea brief <ids...>');
  });
});
