import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { branchesBrought, tipOf } from './gitrepo.ts';
import { tempGitRepo } from './testing.ts';

// What a push into the base writes, held to what was approved of the branches it lands.
describe('landsAs', () => {
  let repo: ReturnType<typeof tempGitRepo>;
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo.dir,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim();
  const change = (file: string, text: string) => {
    writeFileSync(join(repo.dir, file), text);
    git('add', file);
    git('commit', '-q', '-m', file);
  };

  beforeEach(() => {
    repo = tempGitRepo();
    change('root.txt', 'root\n');
    git('branch', '-M', 'main');
    git('update-ref', 'refs/remotes/origin/main', 'main');
    for (const name of ['a', 'b']) {
      git('checkout', '-q', '-b', name, 'main');
      change(`${name}.txt`, `${name}\n`);
    }
    git('checkout', '-q', 'main');
  });

  afterEach(() => repo.remove());

  const approvedAt = (branch: string) => {
    const tip = tipOf(repo.dir, branch);
    if (!tip) throw new Error(`no tip for ${branch}`);
    return { branch, tip };
  };

  it('takes two approved branches merged into the base in one push', () => {
    git('merge', '-q', '--no-ff', '-m', 'a', 'a');
    git('merge', '-q', '--no-ff', '-m', 'b', 'b');
    const approved = ['a', 'b'].map(approvedAt);
    const brought = branchesBrought(repo.dir, 'main', 'origin/main');

    expect(brought.landsAs?.(approved)).toBe(true);
    change('extra.txt', 'never reviewed\n');
    expect(branchesBrought(repo.dir, 'main', 'origin/main').landsAs?.(approved)).toBe(false);
  });

  it('never takes a merge with conflicts: its resolution was never reviewed', () => {
    git('checkout', '-q', 'a');
    change('root.txt', 'a wins\n');
    git('checkout', '-q', 'b');
    change('root.txt', 'b wins\n');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--ff-only', 'a');
    const approved = ['a', 'b'].map(approvedAt);
    try {
      git('merge', '-q', '--no-ff', '-m', 'b', 'b');
    } catch {
      writeFileSync(join(repo.dir, 'root.txt'), 'both\n');
      git('add', 'root.txt');
      git('commit', '-q', '--no-edit');
    }

    expect(branchesBrought(repo.dir, 'main', 'origin/main').landsAs?.(approved)).toBe(false);
  });
});
