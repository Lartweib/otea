import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cli, cliAt, declareProfiles, tempGitRepo } from './testing.ts';

// An agent in the repository's main checkout, sitting on another open item's branch, is told to do
// its item in its own worktree, when it claims it and when next offers it (P1-15, P6-R2-3).
describe('the shared main checkout', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  let otea: Cli;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo.dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  const create = (title: string, branch: string) =>
    otea(
      'create',
      '--collection',
      'Cambios',
      '--title',
      title,
      '--field',
      'Qué quiero=x',
      '--field',
      'Cómo lo valido=- y',
      '--field',
      `Rama=${branch}`,
    );
  const line =
    "This is the repository's main checkout, and it is on cambio/1-regar, the branch of CAM-1: do CAM-2 in its own git worktree (git worktree add ../<folder> -b <branch>) and leave CAM-1's branch as it is.";

  beforeEach(async () => {
    repo = tempGitRepo();
    otea = cliAt(repo.dir, { OTEA_AGENT: 'quill' });
    const person = cliAt(repo.dir);
    await person('init', '--template', 'none');
    await person('board', 'add', 'Cambios', '--template', 'changes');
    declareProfiles(repo.dir, 'quill');
    git('commit', '-q', '--allow-empty', '-m', 'root');
    git('branch', '-M', 'main');
    await create('Regar', 'cambio/1-regar');
    await create('Podar', 'cambio/2-podar');
    git('checkout', '-q', '-b', 'cambio/1-regar');
  });

  afterEach(() => repo.remove());

  it('says so when the agent claims another item there', async () => {
    const claimed = await otea('claim', 'CAM-2');
    expect(claimed.code).toBe(0);
    expect(claimed.out).toContain(line);
    expect((await otea('claim', 'CAM-1')).out).not.toContain('main checkout');
  });

  it('says so when next offers another item there', async () => {
    await otea('claim', 'CAM-1');
    await otea('release', 'CAM-1', '--later');
    const offered = await otea('next');
    expect(offered.out).toContain('CAM-2');
    expect(offered.out).toContain(line);
  });

  it('says nothing on main, or in a worktree of its own', async () => {
    git('checkout', '-q', 'main');
    expect((await otea('claim', 'CAM-2')).out).not.toContain('main checkout');
  });
});
